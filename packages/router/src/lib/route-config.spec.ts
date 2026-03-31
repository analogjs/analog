import { describe, expect, it } from 'vitest';

import { toRouteConfig } from './route-config';
import { ANALOG_META_KEY } from './endpoints';

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
    const result = await (config.resolve as Record<string, Function>)['load'](
      fakeActivatedRoute,
    );
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
    const result = await (config.resolve as Record<string, Function>)['load'](
      fakeActivatedRoute,
    );
    expect(result).toEqual({});
  });
});
