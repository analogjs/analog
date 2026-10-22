import { describe, expect, it } from 'vitest';

import { parseContentFile } from './parse-content-file';

describe('parseContentFile', () => {
  it('uses build-time metadata from content modules', async () => {
    const result = await parseContentFile({
      default: '<h1>Hello</h1>',
      metadata: { title: 'Hello' },
    });

    expect(result).toEqual({
      content: '<h1>Hello</h1>',
      attributes: { title: 'Hello' },
    });
  });

  it('parses frontmatter from raw strings', async () => {
    const result = await parseContentFile('---\ntitle: Hello\n---\n# Hello');

    expect(result).toEqual({
      content: '# Hello',
      attributes: { title: 'Hello' },
    });
  });
});
