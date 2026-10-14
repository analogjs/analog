import {
  injectLoad,
  injectNavigate,
  injectParams,
  injectQuery,
  injectResources,
  injectRouteData,
  injectRouteResources,
  toRoute,
  type LinkToInput,
  type RouteDataOutput,
  type RouteResourcesOutput,
} from '@analogjs/router';
import type { ResourceRef } from '@angular/core';

import type { Org, Team, User } from './data';

const MEMBER = '/orgs/[orgId]/teams/[teamId]/members/[memberId]';

/**
 * Compile-time checks against the generated route table. The build
 * type-checks this file; nothing calls it.
 */
export function routeTypeAssertions() {
  // Paths and params
  const navigate = injectNavigate();
  navigate('/');
  navigate('/users/[userId]', { params: { userId: 1 } });
  navigate('/docs/[...slug]', { params: { slug: ['a', 'b'] } });
  navigate('/files/[[...path]]');
  navigate('/search', { query: { tag: ['a', 'b'] }, hash: 'top' });
  navigate('/about', { replaceUrl: true });
  // @ts-expect-error unknown path
  navigate('/nope');
  // @ts-expect-error missing required params
  navigate('/users/[userId]');
  // @ts-expect-error unknown param name
  navigate('/users/[userId]', { params: { id: 1 } });
  // @ts-expect-error params are strings or numbers
  navigate('/users/[userId]', { params: { userId: true } });
  // @ts-expect-error required catch-alls need a segment
  navigate('/docs/[...slug]', { params: { slug: [] } });
  // @ts-expect-error static routes take no params
  navigate('/about', { params: { id: 1 } });
  navigate('/search', { query: { page: 2, archived: true } });
  // @ts-expect-error query values are strings, numbers, or booleans
  navigate('/search', { query: { since: new Date() } });

  // Params and query
  const memberParams: { orgId: string; teamId: string; memberId: string } =
    injectParams(MEMBER)();
  const slug: string[] = injectParams('/docs/[...slug]')().slug;
  const path: string[] | undefined = injectParams('/files/[[...path]]')().path;
  const view: string | string[] | undefined = injectQuery(MEMBER)()['view'];
  // @ts-expect-error query values written as numbers read back as strings
  const pageNumber: number | undefined = injectQuery('/search')()['page'];

  // Route data: layouts, resolvers, overrides, and server load
  const settings = injectRouteData('/admin/settings')();
  const requiresAuth: boolean = settings.requiresAuth;
  const permissions: string[] = settings.permissions;
  const section: 'settings' = settings.section;

  const member: RouteDataOutput<typeof MEMBER> = injectRouteData(MEMBER)();
  const org: Org | undefined = member.org;
  const team: Team | undefined = member.team;
  const area: string = member.area;
  const projects: string[] = member.load.projects;
  // @ts-expect-error layout loads are not inherited
  member.load.teamCount;

  const theme: 'marketing' = injectRouteData('/pricing')().theme;
  // @ts-expect-error dot notation is not wrapped by users.page.ts
  injectRouteData('/users/[userId]/posts/[postId]')().section;
  // @ts-expect-error users.page.ts and users/index.page.ts share /users
  injectRouteData('/users')().section;

  injectLoad('/users/[userId]').subscribe(({ postCount }) => {
    const count: number = postCount;
  });
  // @ts-expect-error no server load
  injectLoad('/about');

  // Relative navigation
  const fromMember = injectNavigate(MEMBER);
  fromMember('.', { params: { memberId: 2 }, query: { view: 'compact' } });
  fromMember('..');
  fromMember('../..');
  fromMember('../../../..', { replaceUrl: true });
  fromMember('/orgs/[orgId]/teams/[teamId]', { params: { teamId: 'docs' } });
  fromMember('/users/[userId]', { params: { userId: 1 } });
  // @ts-expect-error sibling params change through '.'
  fromMember('../[memberId]', { params: { memberId: 2 } });
  // @ts-expect-error /orgs/[orgId]/teams is not a route
  fromMember('../../..');
  // @ts-expect-error params after the paths diverge are required
  fromMember('/users/[userId]');

  const fromSettings = injectNavigate('/admin/settings');
  fromSettings('../dashboard');
  // @ts-expect-error siblings resolve through the shared ancestor
  fromSettings('./dashboard');

  // Navigation extras and functional updaters
  navigate(
    '/search',
    { query: { page: 2 } },
    { queryParamsHandling: 'merge', preserveFragment: true },
  );
  navigate(
    '/search',
    { query: { tag: null } },
    { queryParamsHandling: 'merge' },
  );
  fromMember('.', { params: (prev) => ({ memberId: `${prev.memberId}-2` }) });
  fromMember('..', { query: (prev) => ({ ...prev, view: 'compact' }) });
  // @ts-expect-error typed query replaces queryParams
  navigate('/search', undefined, { queryParams: { page: '2' } });
  // @ts-expect-error prev holds the current route's params
  fromMember('.', { params: (prev) => ({ memberId: prev.userId }) });
  // @ts-expect-error updaters need a current route
  navigate('/users/[userId]', { params: () => ({ userId: 1 }) });

  // Untyped reads for shared URLs and shared components
  const anyParams: Record<string, string | undefined> = injectParams()();
  const anyQuery: Record<string, string | string[] | undefined> =
    injectQuery()();
  const anyData: Record<string, unknown> = injectRouteData()();
  const anyResources = injectResources();
  const anyRouteResources = injectRouteResources();
  // @ts-expect-error untyped values may be missing
  const anyUserId: string = injectParams()()['userId'];

  // Route resources
  const userResources: RouteResourcesOutput<'/users/[userId]'> =
    injectResources('/users/[userId]');
  const userResourceRef: ResourceRef<User | undefined> =
    userResources.userResource;
  const userName: string | undefined = userResources.userResource.value()?.name;
  // @ts-expect-error unknown resource name
  userResources.missing;
  const aliasedResources = injectRouteResources('/users/[userId]');
  const aliasedRef: ResourceRef<User | undefined> =
    aliasedResources.userResource;

  // LinkTo inputs
  const links: LinkToInput<'/users/[userId]'>[] = [
    '..',
    '.',
    { path: './posts/[postId]', params: { postId: 1 } },
    { path: '/users/[userId]/posts/[postId]', params: { postId: 1 } },
  ];
  // @ts-expect-error dynamic routes need a destination object
  const bare: LinkToInput = '/users/[userId]';
  // @ts-expect-error so do routes with only optional params
  const optional: LinkToInput = '/files/[[...path]]';
  // @ts-expect-error the new postId param is required
  const partial: LinkToInput<'/users/[userId]'> = './posts/[postId]';

  const commands: string[] = toRoute('/docs/[...slug]', {
    params: { slug: ['a b'] },
  }).path;
  // @ts-expect-error toRoute checks params too
  toRoute('/users/[userId]');
}
