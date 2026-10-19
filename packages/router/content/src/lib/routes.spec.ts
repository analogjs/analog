import { Route } from '@angular/router';

import { ROUTE_JSON_LD_KEY } from '../../../src/lib/json-ld';
import { createContentRoutes, Files } from './routes';

describe('content routes', () => {
  describe('a nested content route', () => {
    const files: Files = {
      '/src/content/a/b/content.md': () =>
        Promise.resolve(`# Content Route

Testing nested markdown routes.
`),
    };

    const routes = createContentRoutes(files);
    const route = routes[0];

    it('should have a nested path matching content file segments', () => {
      expect(route.path).toBe('a');
      expect(route.children?.[0].path).toBe('b');
      expect(route.children?.[0].children?.[0].path).toBe('content');
    });
  });

  it('should map markdown frontmatter jsonLd into route data', async () => {
    const files: Files = {
      '/src/content/structured-data.md': () =>
        Promise.resolve(`---
title: Structured Data Content
jsonLd:
  "@context": https://schema.org
  "@type": Article
  identifier: analog-content
---

Hello world
`),
    };

    const moduleRoute = createContentRoutes(files)[0];
    const resolvedRoutes = (await moduleRoute.loadChildren?.()) as Route[];
    const resolvedRoute = resolvedRoutes[0];

    expect(resolvedRoute.data).toEqual({
      _analogContent: expect.stringContaining('Hello world'),
      [ROUTE_JSON_LD_KEY]: {
        '@context': 'https://schema.org',
        '@type': 'Article',
        identifier: 'analog-content',
      },
    });
    expect(resolvedRoute.title).toBe('Structured Data Content');
  });
});
