import { describe, expect, it } from 'vitest';

import { parseHtml } from './parse-html';

describe('parseHtml', () => {
  it('decodes entities in text and attribute values', () => {
    const node = parseHtml(
      '<div title="Q&amp;A"><span>Research &amp; Development</span> &copy; 2026</div>',
    );

    expect(JSON.stringify(node)).toContain('"title":"Q&A"');
    expect(JSON.stringify(node)).toContain('"Research & Development"');
    expect(JSON.stringify(node)).toContain('"© 2026"');
  });

  it('keeps escaped markup as text', () => {
    const node = parseHtml('<div>&lt;b&gt;bold&lt;/b&gt;</div>');

    expect(JSON.stringify(node)).toContain('"<b>bold</b>"');
    expect(JSON.stringify(node)).not.toContain('"type":"b"');
  });
});
