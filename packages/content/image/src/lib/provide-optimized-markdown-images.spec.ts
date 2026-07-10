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

    expect(content).toContain('src="/api/_image/w_640/images/cover.png"');
    expect(content).toContain('loading="lazy"');
  });

  it('renders local images with srcset through the endpoint', () => {
    const html = renderImage(
      { href: '/images/cover.png', title: null, text: 'Cover' },
      { widths: [640, 1280] },
    );

    expect(html).toContain('src="/api/_image/w_1280/images/cover.png"');
    expect(html).toContain('w_640/images/cover.png 640w');
    expect(html).toContain('w_1280/images/cover.png 1280w');
    expect(html).toContain('alt="Cover"');
    expect(html).toContain('loading="lazy"');
    expect(html).toContain('decoding="async"');
  });

  it('applies sizes and custom endpoint path', () => {
    const html = renderImage(
      { href: '/a.png', title: 'A title', text: 'a' },
      { path: '/custom', sizes: '100vw', widths: [640] },
    );

    expect(html).toContain('src="/custom/w_640/a.png"');
    expect(html).toContain('sizes="100vw"');
    expect(html).toContain('title="A title"');
  });

  it('passes non-allowlisted remote images through untouched', () => {
    const html = renderImage({
      href: 'https://example.com/x.png',
      title: null,
      text: 'x',
    });

    expect(html).toContain('src="https://example.com/x.png"');
    expect(html).not.toContain('srcset');
    expect(html).toContain('loading="lazy"');
  });

  it('optimizes allowlisted remote images', () => {
    const html = renderImage(
      { href: 'https://images.example.com/x.png', title: null, text: 'x' },
      { domains: ['images.example.com'], widths: [640] },
    );

    expect(html).toContain(
      'src="/api/_image/w_640/https%3A%2F%2Fimages.example.com%2Fx.png"',
    );
    expect(html).toContain('srcset');
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
