import { TestBed } from '@angular/core/testing';
import { ContentRenderer, MarkedContentImages } from '@analogjs/content';
import { describe, expect, it } from 'vitest';

import { provideOptimizedMarkdownImages } from './provide-optimized-markdown-images';

function renderImage(
  token: { href: string; title: string | null; text: string },
  options?: Parameters<typeof provideOptimizedMarkdownImages>[0],
): string {
  TestBed.configureTestingModule({
    providers: [provideOptimizedMarkdownImages(options)],
  });
  return TestBed.inject(MarkedContentImages).renderImage(token);
}

describe('provideOptimizedMarkdownImages', () => {
  it('provides a working markdown renderer on its own', async () => {
    TestBed.configureTestingModule({
      providers: [provideOptimizedMarkdownImages({ widths: [640] })],
    });

    const renderer = TestBed.inject(ContentRenderer);
    const { content } = await renderer.render('![Cover](/images/cover.png)');

    expect(content).toContain(
      'src="/api/_image?src=%2Fimages%2Fcover.png&amp;w=640"',
    );
    expect(content).toContain('loading="lazy"');
  });

  it('renders local images with srcset through the endpoint', () => {
    const html = renderImage(
      { href: '/images/cover.png', title: null, text: 'Cover' },
      { widths: [640, 1280] },
    );

    expect(html).toContain(
      'src="/api/_image?src=%2Fimages%2Fcover.png&amp;w=1280"',
    );
    expect(html).toContain('w=640 640w');
    expect(html).toContain('w=1280 1280w');
    expect(html).toContain('alt="Cover"');
    expect(html).toContain('loading="lazy"');
    expect(html).toContain('decoding="async"');
  });

  it('applies sizes and custom endpoint path', () => {
    const html = renderImage(
      { href: '/a.png', title: 'A title', text: 'a' },
      { path: '/custom', sizes: '100vw', widths: [640] },
    );

    expect(html).toContain('src="/custom?src=%2Fa.png&amp;w=640"');
    expect(html).toContain('sizes="100vw"');
    expect(html).toContain('title="A title"');
  });

  it('passes remote images through untouched', () => {
    const html = renderImage({
      href: 'https://example.com/x.png',
      title: null,
      text: 'x',
    });

    expect(html).toContain('src="https://example.com/x.png"');
    expect(html).not.toContain('srcset');
    expect(html).toContain('loading="lazy"');
  });

  it('escapes attribute values', () => {
    const html = renderImage({
      href: '/a.png',
      title: null,
      text: 'quote " and & amp',
    });

    expect(html).toContain('alt="quote &quot; and &amp; amp"');
  });
});
