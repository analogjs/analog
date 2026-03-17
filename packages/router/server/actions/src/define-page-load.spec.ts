import { describe, expect, it } from 'vitest';
import type { StandardSchemaV1 } from '@standard-schema/spec';
import { definePageLoad } from './define-page-load';

// Minimal Standard Schema implementation for testing
function createSchema<T>(
  validate: (data: unknown) => StandardSchemaV1.Result<T>,
): StandardSchemaV1<unknown, T> {
  return {
    '~standard': {
      version: 1,
      vendor: 'test',
      validate,
    },
  } as StandardSchemaV1<unknown, T>;
}

function createEvent(
  url = 'http://localhost/',
  params: Record<string, string> = {},
) {
  return {
    params,
    req: {} as any,
    res: {} as any,
    fetch: (() => {
      /* noop */
    }) as any,
    event: {
      request: { url },
      context: { params },
      node: { req: {}, res: {} },
    } as any,
  };
}

describe('definePageLoad', () => {
  it('should call handler without validation when no schemas', async () => {
    const load = definePageLoad({
      handler: async ({ params }) => {
        return { user: params };
      },
    });

    const result = await load(
      createEvent('http://localhost/users/42', { id: '42' }),
    );

    expect(result).toEqual({ user: { id: '42' } });
  });

  it('should validate params and pass typed values', async () => {
    const paramsSchema = createSchema<{ id: string }>((data) => {
      const obj = data as Record<string, unknown>;
      if (typeof obj.id !== 'string' || !/^\d+$/.test(obj.id)) {
        return {
          issues: [{ message: 'id must be numeric', path: ['id'] }],
        };
      }
      return { value: { id: obj.id } };
    });

    const load = definePageLoad({
      params: paramsSchema,
      handler: async ({ params }) => {
        return { userId: params.id };
      },
    });

    const result = await load(
      createEvent('http://localhost/users/42', { id: '42' }),
    );

    expect(result).toEqual({ userId: '42' });
  });

  it('should return 422 on params validation failure', async () => {
    const paramsSchema = createSchema<{ id: string }>(() => ({
      issues: [{ message: 'Invalid id' }],
    }));

    const load = definePageLoad({
      params: paramsSchema,
      handler: async () => ({ ok: true }),
    });

    const result = await load(
      createEvent('http://localhost/users/abc', { id: 'abc' }),
    );

    expect(result).toBeInstanceOf(Response);
    const response = result as Response;
    expect(response.status).toBe(422);
  });

  it('should validate query params', async () => {
    const querySchema = createSchema<{ tab: string }>((data) => {
      const obj = data as Record<string, unknown>;
      if (typeof obj.tab !== 'string') {
        return {
          issues: [{ message: 'tab is required' }],
        };
      }
      return { value: { tab: obj.tab } };
    });

    const load = definePageLoad({
      query: querySchema,
      handler: async ({ query }) => {
        return { activeTab: query.tab };
      },
    });

    const result = await load(
      createEvent('http://localhost/users?tab=settings'),
    );

    expect(result).toEqual({ activeTab: 'settings' });
  });

  it('should return 422 on query validation failure', async () => {
    const querySchema = createSchema<{ tab: string }>(() => ({
      issues: [{ message: 'Invalid tab' }],
    }));

    const load = definePageLoad({
      query: querySchema,
      handler: async () => ({ ok: true }),
    });

    const result = await load(createEvent('http://localhost/users'));

    expect(result).toBeInstanceOf(Response);
    const response = result as Response;
    expect(response.status).toBe(422);
  });

  it('should validate both params and query', async () => {
    const paramsSchema = createSchema<{ id: string }>((data) => {
      const obj = data as Record<string, unknown>;
      return { value: { id: String(obj.id) } };
    });

    const querySchema = createSchema<{ view: string }>((data) => {
      const obj = data as Record<string, unknown>;
      return { value: { view: String(obj.view ?? 'default') } };
    });

    const load = definePageLoad({
      params: paramsSchema,
      query: querySchema,
      handler: async ({ params, query }) => {
        return { id: params.id, view: query.view };
      },
    });

    const result = await load(
      createEvent('http://localhost/users/42?view=detailed', { id: '42' }),
    );

    expect(result).toEqual({ id: '42', view: 'detailed' });
  });

  it('should fail params before checking query', async () => {
    const paramsSchema = createSchema<{ id: string }>(() => ({
      issues: [{ message: 'Bad params' }],
    }));

    const querySchema = createSchema<{ tab: string }>(() => ({
      issues: [{ message: 'Bad query' }],
    }));

    const load = definePageLoad({
      params: paramsSchema,
      query: querySchema,
      handler: async () => ({ ok: true }),
    });

    const result = await load(
      createEvent('http://localhost/users/abc', { id: 'abc' }),
    );

    expect(result).toBeInstanceOf(Response);
    const body = await (result as Response).json();
    expect(body[0].message).toBe('Bad params');
  });
});
