import { Component } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter, Route, Router, RouterOutlet } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { injectLoad } from './inject-load';
import { injectParams, injectRouteData } from './inject-typed-params';
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

describe('route data', () => {
  it('merges layout data with page data, resolver results, and load', async () => {
    @Component({
      standalone: true,
      imports: [RouterOutlet],
      template: '<router-outlet />',
    })
    class Layout {}
    @Component({ standalone: true, template: '' })
    class Page {
      data = injectRouteData('/users/[id]' as any);
      load = toSignal(injectLoad('/users/[id]' as any));
    }
    TestBed.configureTestingModule({
      providers: [
        provideRouter(
          createRoutes({
            '/src/app/pages/users.page.ts': async () => ({
              default: Layout,
              routeMeta: {
                data: { section: 'layout', area: 'admin' },
                resolve: {
                  greeting: () => 'layout',
                  nav: () => Promise.resolve(['home']),
                },
              },
            }),
            '/src/app/pages/users/index.page.ts': async () => ({
              default: Page,
              routeMeta: { data: { title: 'Users' } },
            }),
            '/src/app/pages/users/[id].page.ts': async () => ({
              default: Page,
              routeMeta: {
                data: { section: 'users', greeting: 'static' },
                resolve: { greeting: () => Promise.resolve('hello') },
              },
            }),
          }),
        ),
      ],
    });
    const harness = await RouterTestingHarness.create();
    const page = () =>
      harness.routeDebugElement!.query(By.directive(Page))
        .componentInstance as Page;
    await harness.navigateByUrl('/users/42');
    expect(page().data()).toMatchObject({
      area: 'admin',
      nav: ['home'],
      section: 'users',
      greeting: 'hello',
      load: {},
    });
    expect(page().load()).toEqual({});

    await harness.navigateByUrl('/users');
    expect(page().data()).toMatchObject({ section: 'layout', title: 'Users' });
  });
});
