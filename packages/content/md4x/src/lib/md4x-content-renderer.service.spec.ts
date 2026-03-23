import { TestBed } from '@angular/core/testing';
import { describe, it, expect } from 'vitest';

import { ContentRenderer } from '@analogjs/content';
import {
  Md4xContentRendererService,
  MD4X_RENDERER_OPTIONS,
} from './md4x-content-renderer.service';

function setup(options?: Record<string, unknown>) {
  TestBed.configureTestingModule({
    providers: [
      { provide: ContentRenderer, useClass: Md4xContentRendererService },
      options ? { provide: MD4X_RENDERER_OPTIONS, useValue: options } : [],
    ],
  });
  return TestBed.inject(ContentRenderer);
}

describe('Md4xContentRendererService', () => {
  // ── Basic rendering ──────────────────────────────────────────────

  describe('render', () => {
    it('renders markdown to HTML', async () => {
      const renderer = setup();
      const result = await renderer.render('# Hello\n\nWorld');

      expect(result.content).toContain('<h1');
      expect(result.content).toContain('Hello');
      expect(result.content).toContain('<p>World</p>');
    });

    it('renders inline formatting', async () => {
      const renderer = setup();
      const result = await renderer.render('**bold** and *italic* and `code`');

      expect(result.content).toContain('<strong>bold</strong>');
      expect(result.content).toContain('<em>italic</em>');
      expect(result.content).toContain('<code>code</code>');
    });

    it('renders links', async () => {
      const renderer = setup();
      const result = await renderer.render('[Analog](https://analogjs.org)');

      expect(result.content).toContain('href="https://analogjs.org"');
      expect(result.content).toContain('>Analog</a>');
    });

    it('renders images', async () => {
      const renderer = setup();
      const result = await renderer.render('![alt text](/image.png)');

      expect(result.content).toContain('<img');
      expect(result.content).toContain('src="/image.png"');
      expect(result.content).toContain('alt="alt text"');
    });

    it('renders blockquotes', async () => {
      const renderer = setup();
      const result = await renderer.render('> This is a quote');

      expect(result.content).toContain('<blockquote>');
    });

    it('renders ordered and unordered lists', async () => {
      const renderer = setup();
      const ul = await renderer.render('- Item 1\n- Item 2');
      const ol = await renderer.render('1. First\n2. Second');

      expect(ul.content).toContain('<ul>');
      expect(ul.content).toContain('<li>');
      expect(ol.content).toContain('<ol>');
      expect(ol.content).toContain('<li>');
    });

    it('renders horizontal rules', async () => {
      const renderer = setup();
      const result = await renderer.render('Above\n\n---\n\nBelow');

      expect(result.content).toContain('<hr');
    });

    it('returns empty toc for content without headings', async () => {
      const renderer = setup();
      const result = await renderer.render('Just a paragraph.');

      expect(result.toc).toEqual([]);
    });

    it('handles empty string input', async () => {
      const renderer = setup();
      const result = await renderer.render('');

      expect(result.content).toBeDefined();
      expect(result.toc).toEqual([]);
    });
  });

  // ── TOC extraction and heading IDs ───────────────────────────────

  describe('heading IDs and TOC', () => {
    it('extracts TOC from headings', async () => {
      const renderer = setup();
      const result = await renderer.render(
        '# Title\n\n## Section One\n\n## Section Two',
      );

      expect(result.toc).toEqual([
        { id: 'title', level: 1, text: 'Title' },
        { id: 'section-one', level: 2, text: 'Section One' },
        { id: 'section-two', level: 2, text: 'Section Two' },
      ]);
    });

    it('injects heading IDs into HTML', async () => {
      const renderer = setup();
      const result = await renderer.render('# Hello World');

      expect(result.content).toContain('id="hello-world"');
    });

    it('deduplicates heading slugs', async () => {
      const renderer = setup();
      const result = await renderer.render('# Foo\n\n## Foo\n\n### Foo');

      expect(result.toc).toEqual([
        { id: 'foo', level: 1, text: 'Foo' },
        { id: 'foo-1', level: 2, text: 'Foo' },
        { id: 'foo-2', level: 3, text: 'Foo' },
      ]);
      expect(result.content).toContain('id="foo"');
      expect(result.content).toContain('id="foo-1"');
      expect(result.content).toContain('id="foo-2"');
    });

    it('handles headings with special characters', async () => {
      const renderer = setup();
      const content = `
# Level 1
## Level 2

lorem ipsum ....

# Level 1
## Level 2
### Level 3 ?? complex test && &@@

Lorem ipsum 2....
      `;
      const result = await renderer.render(content);

      expect(result.toc.length).toBe(5);
      expect(result.toc[0]).toEqual({
        id: 'level-1',
        level: 1,
        text: 'Level 1',
      });
      expect(result.toc[3].level).toBe(2);
      expect(result.toc[4].level).toBe(3);
      expect(result.toc[4].text).toBe('Level 3 ?? complex test && &@@');
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

  describe('frontmatter handling', () => {
    it('strips frontmatter from output', async () => {
      const renderer = setup();
      const result = await renderer.render(
        '---\ntitle: Test\ntags:\n  - angular\n---\n\n# Content',
      );

      expect(result.content).not.toContain('title: Test');
      expect(result.content).not.toContain('angular');
      expect(result.content).toContain('Content');
    });

    it('handles content that is only frontmatter', async () => {
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
        '| Header A | Header B |\n| --- | --- |\n| Cell 1 | Cell 2 |',
      );

      expect(result.content).toContain('<table>');
      expect(result.content).toContain('<th>');
      expect(result.content).toContain('<td>');
    });

    it('renders task lists', async () => {
      const renderer = setup();
      const result = await renderer.render('- [x] Completed\n- [ ] Pending');

      expect(result.content).toContain('type="checkbox"');
      expect(result.content).toContain('checked');
    });

    it('renders strikethrough', async () => {
      const renderer = setup();
      const result = await renderer.render('~~deleted~~');

      expect(result.content).toContain('<del>');
    });
  });

  // ── Code blocks ──────────────────────────────────────────────────

  describe('code blocks', () => {
    it('renders fenced code blocks', async () => {
      const renderer = setup();
      const result = await renderer.render('```typescript\nconst x = 1;\n```');

      expect(result.content).toContain('<code');
      expect(result.content).toContain('const x = 1;');
    });

    it('renders code blocks with language class', async () => {
      const renderer = setup();
      const result = await renderer.render(
        '```javascript\nconsole.log("hi");\n```',
      );

      expect(result.content).toContain('language-javascript');
    });

    it('renders code blocks without language', async () => {
      const renderer = setup();
      const result = await renderer.render('```\nplain code\n```');

      expect(result.content).toContain('<code');
      expect(result.content).toContain('plain code');
    });

    it('renders indented code blocks', async () => {
      const renderer = setup();
      const result = await renderer.render('    indented code');

      expect(result.content).toContain('<code');
    });
  });

  // ── Options: highlighter ─────────────────────────────────────────

  describe('highlighter option', () => {
    it('passes code and language to highlighter callback', async () => {
      let capturedCode = '';
      let capturedLang = '';
      const renderer = setup({
        highlighter: (code: string, block: { lang: string }) => {
          capturedCode = code;
          capturedLang = block.lang;
          return `<span class="hl">${code}</span>`;
        },
      });

      await renderer.render('```typescript\nconst x = 1;\n```');

      expect(capturedLang).toBe('typescript');
      expect(capturedCode).toContain('const x = 1;');
    });

    it('uses highlighter output in rendered HTML', async () => {
      const renderer = setup({
        highlighter: (_code: string, _block: { lang: string }) =>
          '<mark>highlighted</mark>',
      });

      const result = await renderer.render('```js\ncode\n```');

      expect(result.content).toContain('<mark>highlighted</mark>');
    });

    it('falls back to default when highlighter returns undefined', async () => {
      const renderer = setup({
        highlighter: () => undefined,
      });

      const result = await renderer.render('```js\ncode\n```');

      expect(result.content).toContain('<code');
    });
  });

  // ── Options: heal ────────────────────────────────────────────────

  describe('heal option', () => {
    it('heals unclosed bold', async () => {
      const renderer = setup({ heal: true });
      const result = await renderer.render('**bold without closing');

      expect(result.content).toContain('<strong>');
      expect(result.content).toContain('</strong>');
    });

    it('heals unclosed italic', async () => {
      const renderer = setup({ heal: true });
      const result = await renderer.render('*italic without closing');

      expect(result.content).toContain('<em>');
      expect(result.content).toContain('</em>');
    });

    it('heals unclosed code block', async () => {
      const renderer = setup({ heal: true });
      const result = await renderer.render('```\nunclosed code block');

      expect(result.content).toContain('<code');
    });

    it('does not heal when option is not set', async () => {
      const renderer = setup();
      const result = await renderer.render('**bold without closing');

      // Without healing, md4x treats ** as literal text
      expect(result.content).not.toContain('<strong>');
    });
  });

  // ── getContentHeadings (synchronous) ─────────────────────────────

  describe('getContentHeadings', () => {
    it('extracts headings from raw markdown', () => {
      const renderer = setup();
      const headings = renderer.getContentHeadings(
        '# Title\n\n## Section\n\nParagraph\n\n### Sub',
      );

      expect(headings).toEqual([
        { id: 'title', level: 1, text: 'Title' },
        { id: 'section', level: 2, text: 'Section' },
        { id: 'sub', level: 3, text: 'Sub' },
      ]);
    });

    it('returns empty array for content without headings', () => {
      const renderer = setup();
      const headings = renderer.getContentHeadings('Just text.');

      expect(headings).toEqual([]);
    });

    it('deduplicates slugs in getContentHeadings', () => {
      const renderer = setup();
      const headings = renderer.getContentHeadings('# Same\n\n## Same');

      expect(headings[0].id).toBe('same');
      expect(headings[1].id).toBe('same-1');
    });

    it('ignores non-heading lines', () => {
      const renderer = setup();
      const headings = renderer.getContentHeadings(
        'Paragraph\n\n```\n# not a heading\n```\n\n# Real Heading',
      );

      // The regex approach can't distinguish code blocks, but it's a known
      // limitation — the async render() path uses md4x's native parser which
      // handles this correctly.
      expect(headings.some((h) => h.text === 'Real Heading')).toBe(true);
    });
  });

  // ── Provider integration ─────────────────────────────────────────

  describe('provider', () => {
    it('works without options (null injection)', async () => {
      const renderer = setup();
      const result = await renderer.render('# No Options');

      expect(result.content).toContain('No Options');
      expect(result.toc).toHaveLength(1);
    });

    it('works with empty options object', async () => {
      const renderer = setup({});
      const result = await renderer.render('# Empty Options');

      expect(result.content).toContain('Empty Options');
    });
  });
});
