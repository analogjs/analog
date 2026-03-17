import { describe, it, expect, vi } from 'vitest';
import type { StandardSchemaV1 } from '@standard-schema/spec';
import { defineAction } from './define-action';
import { json } from './actions';

function createMockSchema<T>(
  validator: (value: unknown) => StandardSchemaV1.Result<T>,
): StandardSchemaV1<unknown, T> {
  return {
    '~standard': {
      version: 1,
      vendor: 'test',
      validate: validator,
    },
  };
}

function createMockContext(body: unknown, contentType = 'application/json') {
  const bodyStr = JSON.stringify(body);
  return {
    params: { id: '1' },
    req: {} as any,
    res: {} as any,
    fetch: (() => {}) as any,
    event: {
      headers: new Headers({ 'content-type': contentType }),
      request: new Request('http://localhost/test', {
        method: 'POST',
        headers: { 'content-type': contentType },
        body: bodyStr,
      }),
      method: 'POST',
    } as any,
  };
}

describe('defineAction', () => {
  it('should pass validated data to handler on success', async () => {
    const schema = createMockSchema<{ email: string }>((value) => ({
      value: value as { email: string },
    }));

    const handler = vi.fn(({ data }) => json({ received: data.email }));

    const action = defineAction({ schema, handler });
    const ctx = createMockContext({ email: 'test@example.com' });
    const response = await action(ctx);

    expect(handler).toHaveBeenCalledOnce();
    expect(handler.mock.calls[0][0].data).toEqual({
      email: 'test@example.com',
    });
    expect(response.status).toBe(200);
  });

  it('should return 422 with issues on validation failure', async () => {
    const schema = createMockSchema<{ email: string }>(() => ({
      issues: [{ message: 'Invalid email', path: ['email'] }],
    }));

    const handler = vi.fn(() => json({ ok: true }));

    const action = defineAction({ schema, handler });
    const ctx = createMockContext({ email: 'bad' });
    const response = await action(ctx);

    expect(handler).not.toHaveBeenCalled();
    expect(response.status).toBe(422);
    expect(response.headers.get('X-Analog-Errors')).toBe('true');

    const body = await response.json();
    expect(body).toEqual([{ message: 'Invalid email', path: ['email'] }]);
  });

  it('should parse FormData when content-type is form-urlencoded', async () => {
    const schema = createMockSchema<{ name: string }>((value) => ({
      value: value as { name: string },
    }));

    const handler = vi.fn(({ data }) => json(data));

    const action = defineAction({ schema, handler });

    const formBody = new URLSearchParams({ name: 'Test User' });
    const ctx = {
      params: {},
      req: {} as any,
      res: {} as any,
      fetch: (() => {}) as any,
      event: {
        headers: new Headers({
          'content-type': 'application/x-www-form-urlencoded',
        }),
        request: new Request('http://localhost/test', {
          method: 'POST',
          headers: {
            'content-type': 'application/x-www-form-urlencoded',
          },
          body: formBody,
        }),
        method: 'POST',
      } as any,
    };

    await action(ctx);

    expect(handler).toHaveBeenCalledOnce();
    expect(handler.mock.calls[0][0].data).toEqual({ name: 'Test User' });
  });

  it('should preserve repeated form values as arrays', async () => {
    const schema = createMockSchema<{ role: string[] }>((value) => ({
      value: value as { role: string[] },
    }));
    const handler = vi.fn(({ data }) => json(data));
    const action = defineAction({ schema, handler });

    const formBody = new URLSearchParams();
    formBody.append('role', 'admin');
    formBody.append('role', 'editor');

    const ctx = {
      params: {},
      req: {} as any,
      res: {} as any,
      fetch: (() => {}) as any,
      event: {
        headers: new Headers({
          'content-type': 'application/x-www-form-urlencoded',
        }),
        request: new Request('http://localhost/test', {
          method: 'POST',
          headers: {
            'content-type': 'application/x-www-form-urlencoded',
          },
          body: formBody,
        }),
        method: 'POST',
      } as any,
    };

    await action(ctx);

    expect(handler.mock.calls[0][0].data).toEqual({
      role: ['admin', 'editor'],
    });
  });

  it('should pass event and params through to handler', async () => {
    const schema = createMockSchema<Record<string, never>>((value) => ({
      value: value as Record<string, never>,
    }));

    const handler = vi.fn(({ params, event }) => {
      return json({ paramId: params.id, hasEvent: !!event });
    });

    const action = defineAction({ schema, handler });
    const ctx = createMockContext({});
    await action(ctx);

    expect(handler.mock.calls[0][0].params).toEqual({ id: '1' });
    expect(handler.mock.calls[0][0].event).toBeDefined();
  });

  it('should validate params when params schema is provided', async () => {
    const schema = createMockSchema<Record<string, never>>((value) => ({
      value: value as Record<string, never>,
    }));
    const paramsSchema = createMockSchema<{ id: number }>((value) => {
      const params = value as { id: string };
      return { value: { id: parseInt(params.id, 10) } };
    });

    const handler = vi.fn(({ params }) => json({ paramId: params.id }));
    const action = defineAction({ schema, params: paramsSchema, handler });
    const response = await action(createMockContext({}));

    expect(handler).toHaveBeenCalledOnce();
    expect(handler.mock.calls[0][0].params).toEqual({ id: 1 });
    expect(await response.json()).toEqual({ paramId: 1 });
  });

  it('should return 422 when params validation fails', async () => {
    const schema = createMockSchema<Record<string, never>>((value) => ({
      value: value as Record<string, never>,
    }));
    const paramsSchema = createMockSchema(() => ({
      issues: [{ message: 'Invalid id', path: ['id'] }],
    }));

    const handler = vi.fn(() => json({ ok: true }));
    const action = defineAction({ schema, params: paramsSchema, handler });
    const response = await action(createMockContext({}));

    expect(handler).not.toHaveBeenCalled();
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual([
      { message: 'Invalid id', path: ['id'] },
    ]);
  });

  it('should return empty object when body cannot be parsed', async () => {
    const schema = createMockSchema<Record<string, unknown>>((value) => ({
      value: value as Record<string, unknown>,
    }));

    const handler = vi.fn(({ data }) => json(data));

    const action = defineAction({ schema, handler });

    const ctx = {
      params: {},
      req: {} as any,
      res: {} as any,
      fetch: (() => {}) as any,
      event: {
        headers: new Headers({ 'content-type': 'text/plain' }),
        request: new Request('http://localhost/test', {
          method: 'POST',
          headers: { 'content-type': 'text/plain' },
          body: 'not json',
        }),
        method: 'POST',
      } as any,
    };

    await action(ctx);
    expect(handler.mock.calls[0][0].data).toEqual({});
  });

  it('should handle content-type with charset parameter', async () => {
    const schema = createMockSchema<{ name: string }>((value) => ({
      value: value as { name: string },
    }));

    const handler = vi.fn(({ data }) => json(data));
    const action = defineAction({ schema, handler });

    const ctx = {
      params: {},
      req: {} as any,
      res: {} as any,
      fetch: (() => {}) as any,
      event: {
        headers: new Headers({
          'content-type': 'application/json; charset=utf-8',
        }),
        request: new Request('http://localhost/test', {
          method: 'POST',
          headers: { 'content-type': 'application/json; charset=utf-8' },
          body: JSON.stringify({ name: 'UTF8' }),
        }),
        method: 'POST',
      } as any,
    };

    await action(ctx);
    expect(handler.mock.calls[0][0].data).toEqual({ name: 'UTF8' });
  });

  it('should serialize Issue path segments correctly in fail response', async () => {
    const schema = createMockSchema<unknown>(() => ({
      issues: [
        {
          message: 'Nested error',
          path: ['user', { key: 'address' }, 'zip'],
        },
      ],
    }));

    const handler = vi.fn(() => json({}));
    const action = defineAction({ schema, handler });
    const ctx = createMockContext({});
    const response = await action(ctx);

    const body = await response.json();
    expect(body[0].path).toEqual(['user', { key: 'address' }, 'zip']);
  });

  it('should handle multiple validation issues', async () => {
    const schema = createMockSchema<unknown>(() => ({
      issues: [
        { message: 'Name required', path: ['name'] },
        { message: 'Email required', path: ['email'] },
      ],
    }));

    const handler = vi.fn(() => json({}));
    const action = defineAction({ schema, handler });
    const ctx = createMockContext({});
    const response = await action(ctx);

    const body = await response.json();
    expect(body).toHaveLength(2);
    expect(response.status).toBe(422);
  });

  it('should work with async schema validation', async () => {
    const schema: StandardSchemaV1<unknown, { id: number }> = {
      '~standard': {
        version: 1,
        vendor: 'test',
        validate: async (value) => ({
          value: value as { id: number },
        }),
      },
    };

    const handler = vi.fn(({ data }) => json(data));
    const action = defineAction({ schema, handler });
    const ctx = createMockContext({ id: 42 });
    await action(ctx);

    expect(handler.mock.calls[0][0].data).toEqual({ id: 42 });
  });

  it('should handle schema that transforms input values', async () => {
    const schema = createMockSchema<{ count: number }>((value) => {
      const v = value as { count: string };
      return { value: { count: parseInt(v.count, 10) } };
    });

    const handler = vi.fn(({ data }) => json(data));
    const action = defineAction({ schema, handler });
    const ctx = createMockContext({ count: '5' });
    await action(ctx);

    expect(handler.mock.calls[0][0].data).toEqual({ count: 5 });
  });
});
