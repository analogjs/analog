import { TestBed } from '@angular/core/testing';
import { describe, it, expect } from 'vitest';

import { ContentRenderer } from '../../../src/lib/content-renderer';
import { MD4X_RENDERER_OPTIONS } from './md4x-content-renderer.service';
import { Md4xWasmContentRendererService } from './md4x-wasm-content-renderer.service';

function setup(options?: Record<string, unknown>) {
  TestBed.configureTestingModule({
    providers: [
      { provide: ContentRenderer, useClass: Md4xWasmContentRendererService },
      options ? { provide: MD4X_RENDERER_OPTIONS, useValue: options } : [],
    ],
  });
  return TestBed.inject(ContentRenderer);
}

describe('Md4xWasmContentRendererService', () => {
  // ── Basic rendering ──────────────────────────────────────────────

  describe('render', () => {
    it('renders markdown to HTML via WASM', async () => {
      const renderer = setup();
      const result = await renderer.render('# Hello WASM\n\nContent here.');

      expect(result.content).toContain('<h1');
      expect(result.content).toContain('Hello WASM');
      expect(result.content).toContain('<p>Content here.</p>');
    });

    it('renders inline formatting', async () => {
      const renderer = setup();
      const result = await renderer.render('**bold** and *italic* and `code`');

      expect(result.content).toContain('<strong>bold</strong>');
      expect(result.content).toContain('<em>italic</em>');
      expect(result.content).toContain('<code>code</code>');
    });

    it('renders links and images', async () => {
      const renderer = setup();
      const links = await renderer.render('[Analog](https://analogjs.org)');
      const imgs = await renderer.render('![alt](/img.png)');

      expect(links.content).toContain('href="https://analogjs.org"');
      expect(imgs.content).toContain('src="/img.png"');
    });

    it('renders blockquotes and lists', async () => {
      const renderer = setup();
      const bq = await renderer.render('> Quote');
      const ul = await renderer.render('- Item');

      expect(bq.content).toContain('<blockquote>');
      expect(ul.content).toContain('<li>');
    });

    it('handles empty string input', async () => {
      const renderer = setup();
      const result = await renderer.render('');

      expect(result.content).toBeDefined();
      expect(result.toc).toEqual([]);
    });

    it('returns empty toc for content without headings', async () => {
      const renderer = setup();
      const result = await renderer.render('Just a paragraph.');

      expect(result.toc).toEqual([]);
    });
  });

  // ── Heading IDs/TOC ──────────────────────────────────────────────

  describe('heading IDs and TOC', () => {
    it('extracts TOC and injects heading IDs', async () => {
      const renderer = setup();
      const result = await renderer.render('# Title\n\n## Section');

      expect(result.toc).toEqual([
        { id: 'title', level: 1, text: 'Title' },
        { id: 'section', level: 2, text: 'Section' },
      ]);
      expect(result.content).toContain('id="title"');
      expect(result.content).toContain('id="section"');
    });

    it('deduplicates heading slugs', async () => {
      const renderer = setup();
      const result = await renderer.render('# Foo\n\n## Foo\n\n### Foo');

      expect(result.toc[0].id).toBe('foo');
      expect(result.toc[1].id).toBe('foo-1');
      expect(result.toc[2].id).toBe('foo-2');
    });

    it('handles headings with special characters', async () => {
      const renderer = setup();
      const result = await renderer.render('# Level 3 ?? complex && &@@');

      expect(result.toc[0].text).toBe('Level 3 ?? complex && &@@');
    });

    it('handles all six heading levels', async () => {
      const renderer = setup();
      const result = await renderer.render(
        '# H1\n\n## H2\n\n### H3\n\n#### H4\n\n##### H5\n\n###### H6',
      );

      expect(result.toc).toHaveLength(6);
      expect(result.toc.map((h) => h.level)).toEqual([1, 2, 3, 4, 5, 6]);
    });
  });

  // ── Frontmatter ──────────────────────────────────────────────────

  describe('frontmatter', () => {
    it('strips frontmatter from output', async () => {
      const renderer = setup();
      const result = await renderer.render('---\ntitle: Test\n---\n\n# Body');

      expect(result.content).not.toContain('title: Test');
      expect(result.content).toContain('Body');
    });

    it('handles frontmatter-only content', async () => {
      const renderer = setup();
      const result = await renderer.render('---\ntitle: Only Meta\n---');

      expect(result.content).not.toContain('title');
      expect(result.toc).toEqual([]);
    });
  });

  // ── GFM features ─────────────────────────────────────────────────

  describe('GFM support', () => {
    it('renders tables', async () => {
      const renderer = setup();
      const result = await renderer.render(
        '| A | B |\n| --- | --- |\n| 1 | 2 |',
      );

      expect(result.content).toContain('<table>');
      expect(result.content).toContain('<td>');
    });

    it('renders task lists', async () => {
      const renderer = setup();
      const result = await renderer.render('- [x] Done\n- [ ] Todo');

      expect(result.content).toContain('type="checkbox"');
    });

    it('renders strikethrough', async () => {
      const renderer = setup();
      const result = await renderer.render('~~deleted~~');

      expect(result.content).toContain('<del>');
    });
  });

  // ── Code blocks ──────────────────────────────────────────────────

  describe('code blocks', () => {
    it('renders fenced code blocks with language class', async () => {
      const renderer = setup();
      const result = await renderer.render('```typescript\nconst x = 1;\n```');

      expect(result.content).toContain('<code');
      expect(result.content).toContain('const x = 1;');
      expect(result.content).toContain('language-typescript');
    });

    it('renders code blocks without language', async () => {
      const renderer = setup();
      const result = await renderer.render('```\nplain\n```');

      expect(result.content).toContain('<code');
      expect(result.content).toContain('plain');
    });
  });

  // ── Options ──────────────────────────────────────────────────────

  describe('options', () => {
    it('supports heal option', async () => {
      const renderer = setup({ heal: true });
      const result = await renderer.render('**unclosed bold');

      expect(result.content).toContain('<strong>');
      expect(result.content).toContain('</strong>');
    });

    it('does not heal when option is not set', async () => {
      const renderer = setup();
      const result = await renderer.render('**unclosed bold');

      expect(result.content).not.toContain('<strong>');
    });

    it('passes highlighter option', async () => {
      let captured = '';
      const renderer = setup({
        highlighter: (code: string, block: { lang: string }) => {
          captured = block.lang;
          return `<mark>${code}</mark>`;
        },
      });

      const result = await renderer.render('```js\ncode\n```');

      expect(captured).toBe('js');
      expect(result.content).toContain('<mark>');
    });
  });

  // ── WASM lifecycle ───────────────────────────────────────────────

  describe('WASM lifecycle', () => {
    it('reuses WASM init across multiple renders', async () => {
      const renderer = setup();
      const r1 = await renderer.render('# First');
      const r2 = await renderer.render('# Second');
      const r3 = await renderer.render('# Third');

      expect(r1.content).toContain('First');
      expect(r2.content).toContain('Second');
      expect(r3.content).toContain('Third');
    });
  });

  // ── Sync fallback ────────────────────────────────────────────────

  describe('getContentHeadings', () => {
    it('extracts headings synchronously', () => {
      const renderer = setup();
      const headings = renderer.getContentHeadings('# H1\n\n## H2');

      expect(headings).toEqual([
        { id: 'h1', level: 1, text: 'H1' },
        { id: 'h2', level: 2, text: 'H2' },
      ]);
    });

    it('returns empty for no headings', () => {
      const renderer = setup();
      expect(renderer.getContentHeadings('text')).toEqual([]);
    });
  });
});
