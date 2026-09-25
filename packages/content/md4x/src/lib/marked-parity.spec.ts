import type { Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ContentRenderer } from '../../../src/lib/content-renderer';
import { MarkdownContentRendererService } from '../../../src/lib/markdown-content-renderer.service';
import { MarkedSetupService } from '../../../src/lib/marked-setup.service';
import { Md4xContentRendererService } from './md4x-content-renderer.service';

const renderers: [string, Type<ContentRenderer>][] = [
  ['marked', MarkdownContentRendererService],
  ['md4x', Md4xContentRendererService],
];

// This corpus qualifies the portable runtime contract, not Marked extensions
// used by the docs build or byte-for-byte serialization parity.
describe.each(renderers)(
  '%s portable Markdown contract',
  (_name, rendererType) => {
    let renderer: ContentRenderer;
    beforeEach(() => {
      TestBed.configureTestingModule({
        providers: [rendererType, MarkedSetupService],
      });
      renderer = TestBed.inject(rendererType);
    });

    it.each([
      {
        name: 'inline formatting',
        markdown: 'A **bold** and *emphasized* paragraph with `inline code`.',
        nodes: {
          p: ['A bold and emphasized paragraph with inline code.'],
          strong: ['bold'],
          em: ['emphasized'],
          code: ['inline code'],
        },
      },
      {
        name: 'blockquotes',
        markdown: '> Quoted paragraph',
        nodes: { 'blockquote p': ['Quoted paragraph'] },
      },
      {
        name: 'lists',
        markdown: '- One\n- Two\n\n1. First\n2. Second',
        nodes: { 'ul > li': ['One', 'Two'], 'ol > li': ['First', 'Second'] },
      },
      {
        name: 'GFM tables and strike',
        markdown: '| Name | Value |\n| --- | --- |\n| ~~old~~ | new |',
        nodes: {
          'thead th': ['Name', 'Value'],
          'tbody td': ['old', 'new'],
          del: ['old'],
        },
      },
      {
        name: 'fenced code',
        markdown: '```\nconst answer = 42;\n```',
        nodes: { 'pre > code': ['const answer = 42;'] },
      },
      {
        name: 'indented code',
        markdown: '    const answer = 42;',
        nodes: { 'pre > code': ['const answer = 42;'] },
      },
    ])('renders $name', async ({ markdown, nodes }) => {
      const result = await renderer.render(markdown);
      const document = new DOMParser().parseFromString(
        result.content,
        'text/html',
      );
      for (const [selector, texts] of Object.entries(nodes)) {
        expect(
          Array.from(document.querySelectorAll(selector), (node) =>
            node.textContent?.trim(),
          ),
        ).toEqual(texts);
      }
      expect(result.toc).toEqual([]);
    });

    it('preserves link/image destinations, task states and thematic breaks', async () => {
      const result = await renderer.render(
        '[Analog](https://analogjs.org)\n\n![Logo](/logo.png)\n\n- [x] Done\n- [ ] Pending\n\n---',
      );
      const document = new DOMParser().parseFromString(
        result.content,
        'text/html',
      );
      expect(document.querySelector('a')?.getAttribute('href')).toBe(
        'https://analogjs.org',
      );
      expect(document.querySelector('a')?.textContent).toBe('Analog');
      expect(document.querySelector('img')?.getAttribute('src')).toBe(
        '/logo.png',
      );
      expect(document.querySelector('img')?.getAttribute('alt')).toBe('Logo');
      const checkboxes = Array.from(
        document.querySelectorAll('input[type="checkbox"]'),
      );
      expect(checkboxes.map((node) => node.hasAttribute('checked'))).toEqual([
        true,
        false,
      ]);
      expect(checkboxes.every((node) => node.hasAttribute('disabled'))).toBe(
        true,
      );
      expect(document.querySelectorAll('hr')).toHaveLength(1);
    });

    it('keeps duplicate heading links consistent with the table of contents', async () => {
      const source = '# Guide\n\n## Setup\n\n## Setup';
      for (let render = 0; render < 2; render++) {
        const result = await renderer.render(source);
        const document = new DOMParser().parseFromString(
          result.content,
          'text/html',
        );
        expect(
          result.toc.map(({ id, text, level }) => ({ id, text, level })),
        ).toEqual([
          { id: 'guide', text: 'Guide', level: 1 },
          { id: 'setup', text: 'Setup', level: 2 },
          { id: 'setup-1', text: 'Setup', level: 2 },
        ]);
        expect(
          Array.from(document.querySelectorAll('h1, h2'), (node) => node.id),
        ).toEqual(result.toc.map((heading) => heading.id));
      }
    });
  },
);
