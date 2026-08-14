import type { StandardSchemaV1 } from '@standard-schema/spec';
import { QueryClient } from '@tanstack/angular-query-experimental';
import { describe, expect, it, vi } from 'vitest';

import {
  ANALOG_QUERIES_KEY,
  definePageLoadQueries,
  type PageLoadQueriesResult,
} from './define-page-load-queries';

function makeCtx(
  url = 'http://localhost/',
): Parameters<ReturnType<typeof definePageLoadQueries>>[0] {
  return {
    params: {},
    req: {} as never,
    res: {} as never,
    fetch: globalThis.fetch as never,
    // `definePageLoad` reads the URL via `getRequestURL(event)`; the
    // `nitro/h3` helper falls back to `event.request.url` when the H3
    // accessor cannot resolve a node request — that's the path used here.
    event: { request: new Request(url) } as never,
  };
}

describe('definePageLoadQueries', () => {
  it('returns { __analogQueries, data } with the dehydrated cache', async () => {
    const load = definePageLoadQueries({
      handler: async ({ client }) => {
        await client.prefetchQuery({
          queryKey: ['posts'],
          queryFn: async () => ['a', 'b'],
        });
        return { extra: 1 };
      },
    });

    const result = (await load(makeCtx())) as PageLoadQueriesResult<{
      extra: number;
    }>;

    expect(result.data).toEqual({ extra: 1 });
    expect(result[ANALOG_QUERIES_KEY].queries).toHaveLength(1);
    expect(result[ANALOG_QUERIES_KEY].queries[0]?.queryKey).toEqual(['posts']);
  });

  it('constructs a fresh QueryClient per invocation', async () => {
    const seen: QueryClient[] = [];

    const load = definePageLoadQueries({
      handler: async ({ client }) => {
        seen.push(client);
      },
    });

    await load(makeCtx());
    await load(makeCtx());

    expect(seen).toHaveLength(2);
    expect(seen[0]).not.toBe(seen[1]);
  });

  it('uses a user-supplied client factory when provided', async () => {
    const factory = vi.fn(
      () =>
        new QueryClient({ defaultOptions: { queries: { staleTime: 999 } } }),
    );

    const load = definePageLoadQueries({
      client: factory,
      handler: async ({ client }) => {
        expect(client.getDefaultOptions().queries?.staleTime).toBe(999);
      },
    });

    await load(makeCtx());

    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('short-circuits with a 422 Response before calling the handler when params validation fails', async () => {
    const failingSchema: StandardSchemaV1<unknown, { id: string }> = {
      '~standard': {
        version: 1,
        vendor: 'test',
        validate: () => ({ issues: [{ message: 'invalid' }] }),
      },
    };
    const handlerSpy = vi.fn();

    const load = definePageLoadQueries({
      params: failingSchema,
      handler: async ({ client }) => {
        handlerSpy(client);
        return { ok: true };
      },
    });

    const result = await load(makeCtx());

    expect(handlerSpy).not.toHaveBeenCalled();
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(422);
  });
});
