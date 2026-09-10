import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Route, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { injectParams } from './inject-typed-params';
import { injectNavigate } from './inject-navigate';
import { buildRouteLink } from './to-route';
import { describe, expect, it } from 'vitest';

import { createRoutes } from './routes';

describe('typed filename paths', () => {
  it.each([
    ['index/details', '/details'],
    ['docs/index/details', '/docs/details'],
    ['reindex', '/re'],
    ['(auth.v2)/login', '/login'],
    ['prefix(group)/details', '/prefix/details'],
  ])('matches runtime route configuration for %s', (filename, expected) => {
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
    expect(runtimePath).toBe(expected);
  });
});

describe('catch-all navigation round trips', () => {
  it.each(['[...slug]', '[[...slug]]'])(
    'preserves decoded segments for %s',
    async (catchAll) => {
      const pattern = `/[team]/${catchAll}`;
      @Component({ standalone: true, template: '' })
      class Page {
        params = injectParams(pattern as any);
        navigate = injectNavigate();
      }
      TestBed.configureTestingModule({
        providers: [
          provideRouter(
            createRoutes({
              [`/src/app/pages/[team]/${catchAll}.page.ts`]: async () => ({
                default: Page,
              }),
            }),
          ),
        ],
      });
      const harness = await RouterTestingHarness.create();
      const router = TestBed.inject(Router);
      const link = buildRouteLink(pattern, {
        params: { team: 'one', slug: ['a/b', 'c d'] },
      });
      const component = await harness.navigateByUrl(
        router.serializeUrl(
          router.createUrlTree(link.path, {
            queryParams: link.queryParams,
            fragment: link.fragment,
          }),
        ),
        Page,
      );
      expect(component.params()).toEqual({ team: 'one', slug: ['a/b', 'c d'] });

      await component.navigate(pattern as any, {
        params: { team: 'two', slug: ['a/b', '(aux)', '%'] },
      });
      expect(component.params()).toEqual({
        team: 'two',
        slug: ['a/b', '(aux)', '%'],
      });

      await component.navigate(pattern as any, {
        params: { team: 0, slug: ['a/b', 42] },
      });
      expect(component.params()).toEqual({ team: '0', slug: ['a/b', '42'] });

      if (catchAll === '[[...slug]]') {
        const base = await harness.navigateByUrl('/one', Page);
        expect(base.params()).toEqual({ team: 'one' });
      }
    },
  );
});
