import { describe, expect, it } from 'vitest';

import { markdownImages } from './markdown-images';

function renderImage(
  token: { href: string; title: string | null; text: string },
  options?: Parameters<typeof markdownImages>[0],
): string {
  const renderer = markdownImages(options).renderer!;
  return (renderer.image as any).call(renderer, token);
}

describe('markdownImages', () => {
  it('renders local images with srcset through the endpoint', () => {
    const html = renderImage(
      { href: '/images/cover.png', title: null, text: 'Cover' },
      { widths: [640, 1280], sizes: '100vw' },
    );

    expect(html).toContain(
      'src="/api/_image?src=%2Fimages%2Fcover.png&amp;w=1280"',
    );
    expect(html).toContain('w=640 640w');
    expect(html).toContain('sizes="100vw"');
    expect(html).toContain('loading="lazy"');
  });

  it('passes remote images through untouched', () => {
    const html = renderImage({
      href: 'https://example.com/x.png',
      title: null,
      text: 'x',
    });

    expect(html).toContain('src="https://example.com/x.png"');
    expect(html).not.toContain('srcset');
  });
});
