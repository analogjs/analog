import { TestBed } from '@angular/core/testing';
import {
  ActivatedRoute,
  provideRouter,
  Router,
  type UrlTree,
} from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import { injectNavigate } from './inject-navigate';

function setup(route?: object) {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([{ path: '**', children: [] }]),
      route ? [{ provide: ActivatedRoute, useValue: route }] : [],
    ],
  });
  const router = TestBed.inject(Router);
  const navigateByUrl = vi.spyOn(router, 'navigateByUrl');
  const urls = () =>
    navigateByUrl.mock.calls.map(([url]) =>
      router.serializeUrl(url as UrlTree),
    );
  return { router, navigateByUrl, urls };
}

describe('injectNavigate', () => {
  it('navigates to the resolved URL', async () => {
    const { router } = setup();
    const navigate = TestBed.runInInjectionContext(() => injectNavigate());

    await navigate('/users/[id]' as any, { params: { id: '42' } });
    expect(router.url).toBe('/users/42');
    await navigate('/about' as any, { query: { ref: 'home' }, hash: 'team' });
    expect(router.url).toBe('/about?ref=home#team');
  });

  it('passes navigation extras with or without route options', async () => {
    const { navigateByUrl } = setup();
    const navigate = TestBed.runInInjectionContext(() => injectNavigate());

    await navigate(
      '/users/[id]' as any,
      { params: { id: '42' } },
      { replaceUrl: true, skipLocationChange: true },
    );
    await navigate('/about' as any, undefined, { replaceUrl: true });
    await navigate('/about' as any, { state: { from: 'test' } });
    expect(navigateByUrl.mock.calls.map(([, extras]) => extras)).toEqual([
      expect.objectContaining({ replaceUrl: true, skipLocationChange: true }),
      expect.objectContaining({ replaceUrl: true }),
      expect.objectContaining({ state: { from: 'test' } }),
    ]);
  });

  it('supports queryParamsHandling and preserveFragment', async () => {
    const { router } = setup();
    const navigate = TestBed.runInInjectionContext(() => injectNavigate());
    await router.navigateByUrl('/search?q=a&page=2#results');

    await navigate(
      '/search' as any,
      { query: { page: '3' } },
      { queryParamsHandling: 'merge', preserveFragment: true },
    );
    expect(router.url).toBe('/search?q=a&page=3#results');
    await navigate(
      '/search' as any,
      { query: { page: undefined } },
      { queryParamsHandling: 'merge' },
    );
    expect(router.url).toBe('/search?q=a');
    await navigate('/about' as any, { queryParamsHandling: 'preserve' });
    expect(router.url).toBe('/about?q=a');
    await navigate(
      '/about' as any,
      { query: { q: null } },
      { queryParamsHandling: 'merge' },
    );
    expect(router.url).toBe('/about');
  });
});

describe('injectNavigate(from)', () => {
  function setupScoped(
    from: string,
    params: Record<string, string>,
    query: Record<string, string> = {},
  ) {
    const params$ = new BehaviorSubject(params);
    const { navigateByUrl, urls } = setup({
      params: params$,
      queryParams: new BehaviorSubject(query),
    });
    const navigate = TestBed.runInInjectionContext(() =>
      injectNavigate(from as any),
    ) as (...args: unknown[]) => Promise<boolean>;
    return { navigate, navigateByUrl, urls, params$ };
  }

  it('resolves relative targets and inherits shared params', async () => {
    const { navigate, navigateByUrl, urls } = setupScoped('/users/[id]', {
      id: '42',
    });
    await navigate('.');
    await navigate('./posts/[postId]', { params: { postId: 7 } });
    await navigate('..', { replaceUrl: true });
    await navigate('/users/[id]/settings', { query: { tab: 'bio' } });
    expect(urls()).toEqual([
      '/users/42',
      '/users/42/posts/7',
      '/users',
      '/users/42/settings?tab=bio',
    ]);
    expect(navigateByUrl.mock.calls[2][1]).toEqual(
      expect.objectContaining({ replaceUrl: true }),
    );
  });

  it('uses explicit params and the latest current params', async () => {
    const { navigate, urls, params$ } = setupScoped('/users/[id]', {
      id: '42',
    });
    await navigate('.', { params: { id: 43 } }, { replaceUrl: true });
    params$.next({ id: '44' });
    await navigate('./posts');
    expect(urls()).toEqual(['/users/43', '/users/44/posts']);
  });

  it('passes current params and query to functional updaters', async () => {
    const { navigate, urls } = setupScoped(
      '/users/[id]',
      { id: '42' },
      { tab: 'bio', page: '1' },
    );
    await navigate('.', {
      params: (prev: { id: string }) => ({ id: Number(prev.id) + 1 }),
    });
    await navigate('.', {
      query: ({ page, ...rest }: Record<string, string>) => ({
        ...rest,
        page: String(Number(page) + 1),
      }),
    });
    await navigate('./posts/[postId]', {
      params: (prev: { id: string }) => ({ postId: prev.id }),
    });
    expect(urls()).toEqual([
      '/users/43',
      '/users/42?tab=bio&page=2',
      '/users/42/posts/42',
    ]);
  });

  it('does not inherit same-named params after paths diverge', () => {
    const { navigate } = setupScoped('/users/[id]', { id: '42' });
    expect(() => navigate('/posts/[id]')).toThrow(
      'Missing required param "id"',
    );
  });
});
