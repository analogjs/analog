import { describe, expectTypeOf, it } from 'vitest';

import type { RoutePathArgs, RoutePathOptions } from './route-path';

declare module './route-path' {
  interface AnalogRouteTable {
    '/users/[id]': {
      params: { id: string };
      paramsOutput: { id: number };
      query: Record<string, string | string[] | undefined>;
      queryOutput: { tab?: 'profile' | 'settings' };
    };
    '/shop/[[...category]]': {
      params: { category?: string[] };
      paramsOutput: { category?: string[] };
      query: Record<string, string | string[] | undefined>;
      queryOutput: { sort?: 'asc' | 'desc' };
    };
  }
}

describe('RoutePathOptions generated route typing', () => {
  it('uses route-specific query output types', () => {
    expectTypeOf<RoutePathOptions<'/users/[id]'>>().toEqualTypeOf<{
      params: { id: string };
      query?: { tab?: 'profile' | 'settings' };
      hash?: string;
    }>();
  });

  it('treats all-optional params as optional route options', () => {
    expectTypeOf<RoutePathArgs<'/shop/[[...category]]'>>().toEqualTypeOf<
      [
        options?: {
          params?: { category?: string[] };
          query?: { sort?: 'asc' | 'desc' };
          hash?: string;
        },
      ]
    >();
  });
});
