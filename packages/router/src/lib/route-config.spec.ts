import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { PLATFORM_ID, TransferState } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { ActivatedRouteSnapshot } from '@angular/router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { API_PREFIX, BASE_URL, INTERNAL_FETCH } from '../../tokens/src';
import { toRouteConfig } from './route-config';
import { ANALOG_META_KEY, ANALOG_PAGE_ENDPOINTS } from './endpoints';
import { requestContextInterceptor } from './request-context';

describe('toRouteConfig', () => {
  it('returns empty config for undefined routeMeta', () => {
    const config = toRouteConfig(undefined);
    expect(config).toBeDefined();
    expect(config.runGuardsAndResolvers).toBe('paramsOrQueryParamsChange');
    expect(config.resolve).toBeDefined();
  });

  it('returns redirect config unchanged', () => {
    const meta = { redirectTo: '/home', pathMatch: 'full' as const };
    const config = toRouteConfig(meta);
    expect(config.redirectTo).toBe('/home');
  });

  // Regression: content routes (from .md files in the pages directory) are
  // built by route-builder.ts WITHOUT setting ANALOG_META_KEY on the route
  // config — only page routes (.page.ts) get the symbol.  The `load`
  // resolver in toRouteConfig() previously accessed
  //   routeConfig[ANALOG_META_KEY].endpointKey
  // unconditionally, crashing with:
  //   TypeError: Cannot read properties of undefined (reading 'endpointKey')
  // during SSR / prerendering of any content route.
  it('load resolver does not crash when ANALOG_META_KEY is absent (content routes)', async () => {
    const config = toRouteConfig(undefined);

    // Simulate a content route's routeConfig — no ANALOG_META_KEY set.
    const fakeRouteConfig = { path: 'about' };
    const fakeActivatedRoute = { routeConfig: fakeRouteConfig };

    // The load resolver must not throw for routes without ANALOG_META_KEY.
    const result = await (
      config.resolve as Record<string, (...args: unknown[]) => unknown>
    )['load'](fakeActivatedRoute);
    expect(result).toEqual({});
  });

  it('load resolver does not crash when ANALOG_META_KEY is present but endpoint is not registered', async () => {
    const config = toRouteConfig(undefined);

    const fakeRouteConfig = {
      path: 'about',
      [ANALOG_META_KEY]: {
        endpoint: '/about',
        endpointKey: '/src/app/pages/about.page.ts',
      },
    };
    const fakeActivatedRoute = { routeConfig: fakeRouteConfig };

    // ANALOG_PAGE_ENDPOINTS is {} in tests (not replaced by Vite), so the
    // lookup returns undefined and the resolver falls through to return {}.
    const result = await (
      config.resolve as Record<string, (...args: unknown[]) => unknown>
    )['load'](fakeActivatedRoute);
    expect(result).toEqual({});
  });

  describe('with an internal server fetch', () => {
    const endpointKey = '/src/app/pages/about.page.ts';

    afterEach(() => {
      delete ANALOG_PAGE_ENDPOINTS[endpointKey];
      TestBed.resetTestingModule();
    });

    it('records the page load in TransferState for hydration', async () => {
      ANALOG_PAGE_ENDPOINTS[endpointKey] = () => Promise.resolve({});
      const internalFetch = Object.assign(vi.fn(), {
        raw: vi.fn().mockResolvedValue({
          _data: { about: true },
          headers: {},
          status: 200,
        }),
      });
      TestBed.configureTestingModule({
        providers: [
          provideHttpClient(withInterceptors([requestContextInterceptor])),
          { provide: PLATFORM_ID, useValue: 'server' },
          { provide: API_PREFIX, useValue: 'api' },
          { provide: BASE_URL, useValue: 'http://localhost:3000' },
          { provide: INTERNAL_FETCH, useValue: internalFetch },
        ],
      });
      const route = {
        routeConfig: {
          path: 'about',
          [ANALOG_META_KEY]: { endpoint: '/pages/about', endpointKey },
        },
        queryParams: {},
        params: {},
        fragment: null,
        parent: null,
      } as unknown as ActivatedRouteSnapshot;

      const load = toRouteConfig(undefined).resolve?.['load'] as (
        route: ActivatedRouteSnapshot,
      ) => Promise<unknown>;
      const result = await TestBed.runInInjectionContext(() => load(route));

      expect(result).toEqual({ about: true });
      const transferred = Object.entries(
        JSON.parse(TestBed.inject(TransferState).toJson()),
      ).filter(([key]) => key.startsWith('analog_'));
      expect(transferred).toEqual([
        [
          expect.any(String),
          expect.objectContaining({ body: { about: true } }),
        ],
      ]);
    });
  });
});
