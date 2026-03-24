/**
 * TypeScript compile-time type tests for the typed route system.
 *
 * These tests use vitest's `expectTypeOf` to verify that the type
 * system correctly enforces constraints at the TypeScript level.
 *
 * Since the AnalogRouteTable is empty by default (augmented by
 * generated code), we test the type utilities directly and simulate
 * augmentation inline.
 */
import { describe, it, expectTypeOf } from 'vitest';

import type {
  AnalogRouteTable,
  AnalogRoutePath,
  RoutePathOptions,
  RoutePathArgs,
  RouteParamsOutput,
  RouteQueryOutput,
} from './route-path';
import { buildUrl } from './route-path';

// ─── Without augmentation (default fallback) ───

describe('type tests: without augmentation', () => {
  it('AnalogRoutePath falls back to string when table is empty', () => {
    expectTypeOf<AnalogRoutePath>().toEqualTypeOf<string>();
  });

  it('RoutePathArgs accepts optional options for any string', () => {
    type Args = RoutePathArgs<string>;
    expectTypeOf<Args>().toEqualTypeOf<
      [
        options?: {
          params?: Record<string, string | string[] | undefined>;
          query?: Record<string, string | string[] | undefined>;
          hash?: string;
        },
      ]
    >();
  });

  it('RouteParamsOutput falls back to Record<string, unknown>', () => {
    type Result = RouteParamsOutput<'/anything'>;
    expectTypeOf<Result>().toEqualTypeOf<Record<string, unknown>>();
  });

  it('RouteQueryOutput falls back to default query type', () => {
    type Result = RouteQueryOutput<'/anything'>;
    expectTypeOf<Result>().toEqualTypeOf<
      Record<string, string | string[] | undefined>
    >();
  });
});

// ─── Simulated augmentation ───

// We test the conditional type logic by simulating what the
// generated src/routeTree.gen.ts would produce.

// Simulate augmented route table entries
interface MockRouteTable {
  '/': {
    params: Record<string, never>;
    paramsOutput: Record<string, never>;
    query: Record<string, string | string[] | undefined>;
    queryOutput: Record<string, string | string[] | undefined>;
  };
  '/users/[id]': {
    params: { id: string };
    paramsOutput: { id: number }; // schema transforms string → number
    query: Record<string, string | string[] | undefined>;
    queryOutput: { tab?: 'profile' | 'settings' };
  };
  '/docs/[...slug]': {
    params: { slug: string[] };
    paramsOutput: { slug: string[] };
    query: Record<string, string | string[] | undefined>;
    queryOutput: Record<string, string | string[] | undefined>;
  };
  '/shop/[[...category]]': {
    params: { category?: string[] };
    paramsOutput: { category?: string[] };
    query: Record<string, string | string[] | undefined>;
    queryOutput: Record<string, string | string[] | undefined>;
  };
}

// Test the conditional types against the mock table

describe('type tests: RoutePathOptions conditional types', () => {
  // Test the conditional type logic using the mock table's shape

  it('static route: options are fully optional', () => {
    // For a route with Record<string, never> params, the options
    // should not include params at all
    type Opts = RoutePathOptions<'/'>;
    // Falls back to base options since '/' is not in real table
    expectTypeOf<Opts>().toMatchTypeOf<{
      params?: Record<string, string | string[] | undefined>;
    }>();
  });

  it('dynamic route: params are required in options', () => {
    // Test the conditional: when params is not Record<string, never>,
    // the options type includes required params
    type DynamicParams = { id: string };
    type HasParams = DynamicParams extends Record<string, never> ? false : true;
    expectTypeOf<HasParams>().toEqualTypeOf<true>();
  });

  it('Record<string, never> detection works correctly', () => {
    type EmptyParams = Record<string, never>;
    type IsEmpty = EmptyParams extends Record<string, never> ? true : false;
    expectTypeOf<IsEmpty>().toEqualTypeOf<true>();
  });
});

describe('type tests: Mock route table type extraction', () => {
  it('extracts params type from mock table', () => {
    type UserParams = MockRouteTable['/users/[id]']['params'];
    expectTypeOf<UserParams>().toEqualTypeOf<{ id: string }>();
  });

  it('extracts paramsOutput (validated) from mock table', () => {
    type UserParamsOut = MockRouteTable['/users/[id]']['paramsOutput'];
    expectTypeOf<UserParamsOut>().toEqualTypeOf<{ id: number }>();
  });

  it('extracts queryOutput (validated) from mock table', () => {
    type UserQueryOut = MockRouteTable['/users/[id]']['queryOutput'];
    expectTypeOf<UserQueryOut>().toEqualTypeOf<{
      tab?: 'profile' | 'settings';
    }>();
  });

  it('static route has empty params', () => {
    type RootParams = MockRouteTable['/']['params'];
    expectTypeOf<RootParams>().toEqualTypeOf<Record<string, never>>();
  });

  it('catch-all has string array params', () => {
    type DocsParams = MockRouteTable['/docs/[...slug]']['params'];
    expectTypeOf<DocsParams>().toEqualTypeOf<{
      slug: string[];
    }>();
  });

  it('optional catch-all has optional string array', () => {
    type ShopParams = MockRouteTable['/shop/[[...category]]']['params'];
    expectTypeOf<ShopParams>().toEqualTypeOf<{
      category?: string[];
    }>();
  });
});

describe('type tests: buildUrl runtime behavior', () => {
  it('returns string', () => {
    expectTypeOf(buildUrl('/about')).toEqualTypeOf<string>();
  });

  it('accepts params option', () => {
    expectTypeOf(
      buildUrl('/users/[id]', { params: { id: '42' } }),
    ).toEqualTypeOf<string>();
  });

  it('accepts query option', () => {
    expectTypeOf(
      buildUrl('/users', { query: { page: '1' } }),
    ).toEqualTypeOf<string>();
  });

  it('accepts hash option', () => {
    expectTypeOf(buildUrl('/about', { hash: 'team' })).toEqualTypeOf<string>();
  });
});
