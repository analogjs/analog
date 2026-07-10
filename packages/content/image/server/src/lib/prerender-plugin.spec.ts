import { describe, expect, it } from 'vitest';

import { extractImageUrls } from './prerender-plugin';

describe('extractImageUrls', () => {
  it('extracts variant urls from src and srcset, deduplicated', () => {
    const html = `
      <img src="/api/_image/w_1920/cover.png"
           srcset="/api/_image/w_640,f_webp/cover.png 640w, /api/_image/w_1920,f_webp/cover.png 1920w">
      <img src="/api/_image/w_1920/cover.png">
    `;

    expect(extractImageUrls(html, '/api/_image')).toEqual([
      '/api/_image/w_1920/cover.png',
      '/api/_image/w_640,f_webp/cover.png',
      '/api/_image/w_1920,f_webp/cover.png',
    ]);
  });

  it('skips remote-source variants', () => {
    const html = `<img src="/api/_image/w_640/https%3A%2F%2Fimages.example.com%2Fx.png">`;
    expect(extractImageUrls(html, '/api/_image')).toEqual([]);
  });

  it('ignores html without variant urls', () => {
    expect(extractImageUrls('<img src="/plain.png">', '/api/_image')).toEqual(
      [],
    );
  });
});
