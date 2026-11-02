import { Component, inject, resource } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import {
  provideRouter,
  RedirectCommand,
  Route,
  Router,
  RouterOutlet,
  withRouterResources,
} from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { of } from 'rxjs';
import { injectLoad } from './inject-load';
import {
  injectParams,
  injectResources,
  injectRouteData,
} from './inject-typed-params';
import { injectNavigate } from './inject-navigate';
import { buildRouteLink } from './to-route';
import { describe, expect, it, vi } from 'vitest';

import { createRoutes } from './routes';

describe('typed filename paths', () => {
  it.each([
    ['index/details', '/details'],
    ['docs/index/details', '/docs/details'],
    ['reindex', '/reindex'],
    ['index(group)', '/'],
    ['(group)index', '/'],
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

  it('inherits and overrides data and resolvers across nested layouts and RedirectCommand', async () => {
    @Component({
      standalone: true,
      imports: [RouterOutlet],
      template: '<router-outlet />',
    })
    class Layout {}
    @Component({ standalone: true, template: '' })
    class LeafPage {
      data = injectRouteData();
    }
    TestBed.configureTestingModule({
      providers: [
        provideRouter(
          createRoutes({
            '/src/app/pages/orgs/[orgId].page.ts': async () => ({
              default: Layout,
              routeMeta: {
                data: { scope: 'org', tier: 'pro' },
                resolve: {
                  org: (route) => ({ id: route.params['orgId'] }),
                  shared: () => 'from-org',
                },
              },
            }),
            '/src/app/pages/orgs/[orgId]/teams/[teamId].page.ts': async () => ({
              default: Layout,
              routeMeta: {
                data: { scope: 'team' },
                resolve: {
                  team: (route) =>
                    of({
                      teamId: route.params['teamId'],
                      orgId: route.data['org'].id,
                    }),
                  shared: () => Promise.resolve('from-team'),
                },
              },
            }),
            '/src/app/pages/orgs/[orgId]/teams/[teamId]/members/index.page.ts':
              async () => ({
                default: LeafPage,
              }),
            '/src/app/pages/orgs/[orgId]/teams/[teamId]/members/[memberId].page.ts':
              async () => ({
                default: LeafPage,
                routeMeta: {
                  resolve: {
                    member: (route) => {
                      const router = inject(Router);
                      return route.params['memberId'] === 'blocked'
                        ? new RedirectCommand(
                            router.parseUrl('/orgs/acme/teams/core/members'),
                          )
                        : {
                            memberId: route.params['memberId'],
                            teamId: route.data['team'].teamId,
                          };
                    },
                  },
                },
              }),
            '/src/app/pages/orgs.[orgId].audit.page.ts': async () => ({
              default: LeafPage,
            }),
          }),
        ),
      ],
    });

    const harness = await RouterTestingHarness.create();
    const leaf = () =>
      harness.routeDebugElement!.query(By.directive(LeafPage))
        .componentInstance as LeafPage;

    // Child with no routeMeta inherits both outer and inner layout data & resolvers
    await harness.navigateByUrl('/orgs/acme/teams/core/members');
    expect(leaf().data()).toMatchObject({
      scope: 'team',
      tier: 'pro',
      org: { id: 'acme' },
      team: { teamId: 'core', orgId: 'acme' },
      shared: 'from-team',
    });

    // Leaf with its own resolver receives inherited layout data & params
    await harness.navigateByUrl('/orgs/acme/teams/core/members/ada');
    expect(leaf().data()).toMatchObject({
      scope: 'team',
      tier: 'pro',
      shared: 'from-team',
      member: { memberId: 'ada', teamId: 'core' },
    });

    // Resolver returning RedirectCommand redirects instead of populating route data
    await harness.navigateByUrl('/orgs/acme/teams/core/members/blocked');
    expect(TestBed.inject(Router).url).toBe('/orgs/acme/teams/core/members');
    expect(leaf().data()['member']).toBeUndefined();

    // Dot-notation sibling is not wrapped by orgs/[orgId].page.ts
    const audit = await harness.navigateByUrl('/orgs/acme/audit', LeafPage);
    expect(audit.data()['tier']).toBeUndefined();
    expect(audit.data()['org']).toBeUndefined();
  });
});

describe('route resources', () => {
  it('wires routeMeta.resources context with params, query, fragment, and inherited layout data', async () => {
    @Component({
      standalone: true,
      imports: [RouterOutlet],
      template: '<router-outlet />',
    })
    class Layout {}
    @Component({ standalone: true, template: '' })
    class UserPage {
      resources = injectResources();
    }
    TestBed.configureTestingModule({
      providers: [
        provideRouter(
          createRoutes({
            '/src/app/pages/users.page.ts': async () => ({
              default: Layout,
              routeMeta: {
                data: { section: 'users' },
                resolve: { prefix: () => 'user' },
              },
            }),
            '/src/app/pages/users/[id].page.ts': async () => ({
              default: UserPage,
              routeMeta: {
                resources: (ctx) => ({
                  summary: resource({
                    params: () => ({
                      id: ctx.params()['id'],
                      tab: ctx.queryParams()['tab'] ?? 'overview',
                      hash: ctx.fragment(),
                      section: ctx.data()['section'],
                      prefix: ctx.data()['prefix'],
                    }),
                    loader: async ({ params }) =>
                      `${params.section}:${params.prefix}:${params.id}:${params.tab}:${params.hash ?? 'none'}`,
                  }),
                }),
              },
            }),
          }),
          withRouterResources(),
        ),
      ],
    });

    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/users/42?tab=posts#bio');
    await TestBed.inject(Router).events;
    const page = harness.routeDebugElement!.query(By.directive(UserPage))
      .componentInstance as UserPage;

    await vi.waitFor(() => {
      expect(page.resources['summary']?.value()).toBe(
        'users:user:42:posts:bio',
      );
    });
  });

  it('inherits ancestor layout resources across ctx.resources() and injectResources() and applies overrides', async () => {
    @Component({
      standalone: true,
      imports: [RouterOutlet],
      template: '<router-outlet />',
    })
    class Layout {}
    @Component({ standalone: true, template: '' })
    class LeafPage {
      resources = injectResources();
    }

    TestBed.configureTestingModule({
      providers: [
        provideRouter(
          createRoutes({
            '/src/app/pages/orgs/[orgId].page.ts': async () => ({
              default: Layout,
              routeMeta: {
                resources: (ctx) => ({
                  org: resource({
                    params: () => ctx.params()['orgId'],
                    loader: async ({ params: orgId }) => ({ orgId }),
                  }),
                  badge: resource({
                    loader: async () => 1,
                  }),
                }),
              },
            }),
            '/src/app/pages/orgs/[orgId]/teams/[teamId].page.ts': async () => ({
              default: Layout,
              routeMeta: {
                resources: (ctx) => ({
                  team: resource({
                    params: () => {
                      const org = ctx.resources()['org']?.value() as
                        | { orgId: string }
                        | undefined;
                      if (!org) return undefined;
                      return {
                        teamId: ctx.params()['teamId'],
                        orgId: org.orgId,
                      };
                    },
                    loader: async ({ params }) => params,
                  }),
                  badge: resource({
                    loader: async () => 'team-badge',
                  }),
                }),
              },
            }),
            '/src/app/pages/orgs/[orgId]/teams/[teamId]/members/index.page.ts':
              async () => ({
                default: LeafPage,
              }),
            '/src/app/pages/orgs/[orgId]/teams/[teamId]/members/[memberId].page.ts':
              async () => ({
                default: LeafPage,
                routeMeta: {
                  resources: (ctx) => ({
                    member: resource({
                      params: () => {
                        const org = ctx.resources()['org']?.value() as
                          | { orgId: string }
                          | undefined;
                        const team = ctx.resources()['team']?.value() as
                          | { teamId: string; orgId: string }
                          | undefined;
                        const badge = ctx.resources()['badge']?.value() as
                          | string
                          | undefined;
                        if (!org || !team || !badge) return undefined;
                        return {
                          memberId: ctx.params()['memberId'],
                          orgId: org.orgId,
                          teamId: team.teamId,
                          badge,
                        };
                      },
                      loader: async ({ params }) => params,
                    }),
                  }),
                },
              }),
            '/src/app/pages/orgs.[orgId].audit.page.ts': async () => ({
              default: LeafPage,
            }),
          }),
          withRouterResources(),
        ),
      ],
    });

    const harness = await RouterTestingHarness.create();
    const leaf = () =>
      harness.routeDebugElement!.query(By.directive(LeafPage))
        .componentInstance as LeafPage;

    // Child with no routeMeta.resources inherits outer and inner layout resources and overrides
    await harness.navigateByUrl('/orgs/acme/teams/core/members');
    await vi.waitFor(() => {
      expect(leaf().resources['org']?.value()).toEqual({ orgId: 'acme' });
      expect(leaf().resources['team']?.value()).toEqual({
        teamId: 'core',
        orgId: 'acme',
      });
      expect(leaf().resources['badge']?.value()).toBe('team-badge');
    });

    // Leaf chains ctx.resources() across both layouts and exposes merged resources via injectResources()
    await harness.navigateByUrl('/orgs/acme/teams/core/members/ada');
    await vi.waitFor(() => {
      expect(leaf().resources['org']?.value()).toEqual({ orgId: 'acme' });
      expect(leaf().resources['team']?.value()).toEqual({
        teamId: 'core',
        orgId: 'acme',
      });
      expect(leaf().resources['badge']?.value()).toBe('team-badge');
      expect(leaf().resources['member']?.value()).toEqual({
        memberId: 'ada',
        orgId: 'acme',
        teamId: 'core',
        badge: 'team-badge',
      });
    });

    // Dot-notation sibling is not wrapped by orgs/[orgId].page.ts and does not inherit its resources
    const audit = await harness.navigateByUrl('/orgs/acme/audit', LeafPage);
    expect(audit.resources).toEqual({});
  });
});
