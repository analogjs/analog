import { describe, expect, it } from 'vitest';
import { extractHeadings } from './toc';

describe('extractHeadings', () => {
  it('parses h2 and h3 with their ids and text', () => {
    const html = `
      <h2 id="intro">Introduction</h2>
      <p>Some prose.</p>
      <h3 id="install">Installation</h3>
      <h2 id="usage">Usage</h2>
    `;
    expect(extractHeadings(html)).toEqual([
      { level: 2, text: 'Introduction', id: 'intro' },
      { level: 3, text: 'Installation', id: 'install' },
      { level: 2, text: 'Usage', id: 'usage' },
    ]);
  });

  it('strips inline markup from heading text', () => {
    const html = `<h2 id="x">Text with <code>code</code> in it</h2>`;
    expect(extractHeadings(html)).toEqual([
      { level: 2, text: 'Text with code in it', id: 'x' },
    ]);
  });

  it('returns an empty array when no headings are present', () => {
    expect(extractHeadings('<p>nothing here</p>')).toEqual([]);
  });
});
