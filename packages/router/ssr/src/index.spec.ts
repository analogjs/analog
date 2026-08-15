import { REQUEST as ANGULAR_REQUEST, RESPONSE_INIT } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BASE_URL, LOCALE, REQUEST, RESPONSE } from '@analogjs/router/tokens';

import { RenderMode } from '@angular/ssr';

import { createAnalogServerRoutes, provideServerRequestContext } from './index';

describe('provideServerRequestContext', () => {
  it('bridges the Angular request and response init into Analog tokens', () => {
    const responseInit: ResponseInit = {};

    TestBed.configureTestingModule({
      providers: [
        provideServerRequestContext(),
        {
          provide: ANGULAR_REQUEST,
          useValue: new Request('http://example.com/products/1?ref=home', {
            headers: { cookie: 'session=abc' },
          }),
        },
        { provide: RESPONSE_INIT, useValue: responseInit },
      ],
    });

    const request = TestBed.inject(REQUEST);
    expect(request.originalUrl).toBe('/products/1?ref=home');
    expect(request.url).toBe('/products/1?ref=home');
    expect(request.method).toBe('GET');
    expect(request.headers.cookie).toBe('session=abc');

    expect(TestBed.inject(BASE_URL)).toBe('http://example.com');

    const response = TestBed.inject(RESPONSE);
    response.statusCode = 404;
    response.setHeader('x-robots-tag', 'noindex');
    expect(response.statusCode).toBe(404);
    expect(responseInit.status).toBe(404);
    expect((responseInit.headers as Headers).get('x-robots-tag')).toBe(
      'noindex',
    );
    expect(response.getHeader('x-robots-tag')).toBe('noindex');
  });

  it('detects the locale from the URL path prefix', () => {
    TestBed.configureTestingModule({
      providers: [
        provideServerRequestContext(),
        {
          provide: ANGULAR_REQUEST,
          useValue: new Request('http://example.com/fr/products/1'),
        },
      ],
    });

    expect(TestBed.inject(LOCALE)).toBe('fr');
  });

  it('falls back to the Accept-Language header for the locale', () => {
    TestBed.configureTestingModule({
      providers: [
        provideServerRequestContext(),
        {
          provide: ANGULAR_REQUEST,
          useValue: new Request('http://example.com/products/1', {
            headers: { 'accept-language': 'de;q=0.8, en-US;q=0.9' },
          }),
        },
      ],
    });

    expect(TestBed.inject(LOCALE)).toBe('en-US');
  });

  it('resolves the tokens to null outside of a server request', () => {
    TestBed.configureTestingModule({
      providers: [provideServerRequestContext()],
    });

    expect(TestBed.inject(REQUEST)).toBeNull();
    expect(TestBed.inject(RESPONSE)).toBeNull();
    expect(TestBed.inject(BASE_URL)).toBeNull();
    expect(TestBed.inject(LOCALE)).toBeNull();
  });
});

describe('createAnalogServerRoutes', () => {
  const files = {
    '/src/app/pages/index.page.ts': () => Promise.resolve({}) as never,
    '/src/app/pages/feedback.page.ts': () => Promise.resolve({}) as never,
    '/src/app/pages/fn-demo.page.ts': () => Promise.resolve({}) as never,
    '/src/app/pages/products/[productId].page.ts': () =>
      Promise.resolve({
        routeMeta: { getPrerenderParams: () => [{ productId: '1' }] },
      }) as never,
    '/src/app/pages/blog/[slug].page.ts': () => Promise.resolve({}) as never,
  };

  it('derives render modes from files, endpoints, and server paths', async () => {
    const routes = createAnalogServerRoutes(files, {
      pageEndpoints: { '/src/app/pages/feedback.server.ts': true },
      routeFilesMeta: {
        '/src/app/pages/fn-demo.page.ts': { prerender: false },
      },
      debugRoutes: true,
    });

    const byPath = Object.fromEntries(routes.map((r) => [r.path, r]));
    expect(byPath[''].renderMode).toBe(RenderMode.Prerender);
    expect(byPath['feedback'].renderMode).toBe(RenderMode.Server);
    expect(byPath['fn-demo'].renderMode).toBe(RenderMode.Server);
    expect(byPath['products/:productId'].renderMode).toBe(RenderMode.Prerender);
    expect(
      await (
        byPath['products/:productId'] as {
          getPrerenderParams?: () => Promise<unknown>;
        }
      ).getPrerenderParams?.(),
    ).toEqual([{ productId: '1' }]);
    // Dynamic module-backed paths prerender with a params loader that
    // resolves empty when routeMeta defines none — @angular/ssr's
    // per-request fallback shape.
    expect(byPath['blog/:slug'].renderMode).toBe(RenderMode.Prerender);
    expect(byPath['__analog/routes'].renderMode).toBe(RenderMode.Server);
  });

  it('expands content files into params for prerenderContent routes', async () => {
    const routes = createAnalogServerRoutes(files, {
      prerenderContent: [{ contentDir: 'src/content', route: 'blog/:slug' }],
      contentFilesList: {
        '/src/content/first.md': { title: 'First' },
        '/src/content/second.md': { title: 'Second' },
        '/src/content/nested/deep.md': { title: 'Skipped (not top level)' },
      },
    });

    const blog = routes.find((r) => r.path === 'blog/:slug') as {
      renderMode: RenderMode;
      getPrerenderParams?: () => Promise<unknown>;
    };
    expect(blog.renderMode).toBe(RenderMode.Prerender);
    expect(await blog.getPrerenderParams?.()).toEqual([
      { slug: 'first' },
      { slug: 'second' },
    ]);
  });
});
