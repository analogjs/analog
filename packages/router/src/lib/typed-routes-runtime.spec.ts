import { Route } from '@angular/router';
import { describe, expect, it } from 'vitest';

import { filenameToRoutePath } from '../../../platform/src/lib/route-manifest';
import { createRoutes } from './routes';

describe('typed filename paths', () => {
  it.each([
    'index/details',
    'docs/index/details',
    'reindex',
    '(auth.v2)/login',
    'prefix(group)/details',
  ])('matches runtime route configuration for %s', (filename) => {
    const file = `/src/app/pages/${filename}.page.ts`;
    const routes = createRoutes({
      [file]: async () => ({ default: class Page {} }),
    });
    function leafPath(route: Route): string[] {
      return [
        route.path ?? '',
        ...(route.children ? leafPath(route.children[0]) : []),
      ];
    }
    const runtimePath = '/' + leafPath(routes[0]).filter(Boolean).join('/');
    expect(filenameToRoutePath(file)).toBe(runtimePath);
  });
});
