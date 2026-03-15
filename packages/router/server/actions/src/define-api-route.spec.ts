import { describe, it, expect, vi } from 'vitest';
import type { StandardSchemaV1 } from '@standard-schema/spec';
import { defineApiRoute } from './define-api-route';

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

function createMockEvent(
  method: string,
  body?: unknown,
  contentType = 'application/json',
  url = 'http://localhost/api/test',
  params: Record<string, unknown> = {},
) {
  const headers = new Headers();
  if (contentType) {
    headers.set('content-type', contentType);
  }

  const init: RequestInit = {
    method,
    headers,
  };
  if (body && method !== 'GET' && method !== 'HEAD') {
    init.body =
      body instanceof FormData ||
      body instanceof URLSearchParams ||
      typeof body === 'string'
        ? body
        : JSON.stringify(body);
  }
  const request = new Request(url, init);
  return {
    method,
    headers: request.headers,
    request,
    context: {
      params,
    },
  } as any;
}

describe('defineApiRoute', () => {
  it('should validate POST body and pass typed data to handler', async () => {
    const input = createMockSchema<{ name: string }>((value) => ({
      value: value as { name: string },
    }));

    const handler = vi.fn(({ data }) => ({ id: '1', name: data.name }));

    const route = defineApiRoute({ input, handler });
    const event = createMockEvent('POST', { name: 'Alice' });
    const response = await route(event);

    expect(handler).toHaveBeenCalledOnce();
    expect(handler.mock.calls[0][0].data).toEqual({ name: 'Alice' });
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body).toEqual({ id: '1', name: 'Alice' });
  });

  it('should return 422 on input validation failure', async () => {
    const input = createMockSchema<{ name: string }>(() => ({
      issues: [{ message: 'Name is required' }],
    }));

    const handler = vi.fn(() => ({}));

    const route = defineApiRoute({ input, handler });
    const event = createMockEvent('POST', {});
    const response = await route(event);

    expect(handler).not.toHaveBeenCalled();
    expect(response.status).toBe(422);
    expect(response.headers.get('X-Analog-Errors')).toBe('true');
  });

  it('should validate GET query params', async () => {
    const input = createMockSchema<{ search: string }>((value) => ({
      value: value as { search: string },
    }));

    const handler = vi.fn(({ data }) => ({
      results: [],
      query: data.search,
    }));

    const route = defineApiRoute({ input, handler });
    const event = createMockEvent(
      'GET',
      undefined,
      'application/json',
      'http://localhost/api/search?search=hello',
    );
    const response = await route(event);

    expect(handler).toHaveBeenCalledOnce();
    expect(handler.mock.calls[0][0].data).toEqual({ search: 'hello' });
  });

  it('should validate route params when params schema is provided', async () => {
    const params = createMockSchema<{ id: number }>((value) => {
      const routeParams = value as { id: string };
      return { value: { id: parseInt(routeParams.id, 10) } };
    });
    const handler = vi.fn(({ params }) => ({ id: params.id }));

    const route = defineApiRoute({ params, handler });
    const response = await route(
      createMockEvent(
        'GET',
        undefined,
        'application/json',
        'http://localhost/api/users/42',
        { id: '42' },
      ),
    );

    expect(handler).toHaveBeenCalledOnce();
    expect(handler.mock.calls[0][0].params).toEqual({ id: 42 });
    expect(await response.json()).toEqual({ id: 42 });
  });

  it('should return 422 when route params validation fails', async () => {
    const params = createMockSchema(() => ({
      issues: [{ message: 'Missing id', path: ['id'] }],
    }));
    const handler = vi.fn(() => ({}));

    const route = defineApiRoute({ params, handler });
    const response = await route(
      createMockEvent(
        'GET',
        undefined,
        'application/json',
        'http://localhost/api/users',
        {},
      ),
    );

    expect(handler).not.toHaveBeenCalled();
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual([
      { message: 'Missing id', path: ['id'] },
    ]);
  });

  it('should validate explicit query schema independently of body validation', async () => {
    const query = createMockSchema<{ page: number }>((value) => {
      const search = value as { page: string };
      return { value: { page: parseInt(search.page, 10) } };
    });
    const handler = vi.fn(({ data, query }) => ({
      page: data.page,
      queryPage: query.page,
    }));

    const route = defineApiRoute({ query, handler });
    const response = await route(
      createMockEvent(
        'GET',
        undefined,
        'application/json',
        'http://localhost/api/search?page=2',
      ),
    );

    expect(handler.mock.calls[0][0].data).toEqual({ page: 2 });
    expect(handler.mock.calls[0][0].query).toEqual({ page: 2 });
    expect(await response.json()).toEqual({ page: 2, queryPage: 2 });
  });

  it('should validate explicit body schema independently of query validation', async () => {
    const body = createMockSchema<{ published: boolean }>((value) => {
      const requestBody = value as { published: string };
      return { value: { published: requestBody.published === 'true' } };
    });
    const handler = vi.fn(({ data, body }) => ({
      data,
      body,
    }));
    const formBody = new URLSearchParams({ published: 'true' });

    const route = defineApiRoute({ body, handler });
    const response = await route(
      createMockEvent('POST', formBody, 'application/x-www-form-urlencoded'),
    );

    expect(handler.mock.calls[0][0].data).toEqual({ published: true });
    expect(handler.mock.calls[0][0].body).toEqual({ published: true });
    expect(await response.json()).toEqual({
      data: { published: true },
      body: { published: true },
    });
  });

  it('should support explicit query and body schemas together', async () => {
    const query = createMockSchema<{ preview: boolean }>((value) => {
      const search = value as { preview: string };
      return { value: { preview: search.preview === 'true' } };
    });
    const body = createMockSchema<{ name: string }>((value) => ({
      value: value as { name: string },
    }));
    const handler = vi.fn(({ data, query, body }) => ({
      data,
      query,
      body,
    }));

    const route = defineApiRoute({ query, body, handler });
    const response = await route(
      createMockEvent(
        'POST',
        { name: 'Alice' },
        'application/json',
        'http://localhost/api/users?preview=true',
      ),
    );

    expect(handler.mock.calls[0][0].data).toEqual({ name: 'Alice' });
    expect(handler.mock.calls[0][0].query).toEqual({ preview: true });
    expect(handler.mock.calls[0][0].body).toEqual({ name: 'Alice' });
    expect(await response.json()).toEqual({
      data: { name: 'Alice' },
      query: { preview: true },
      body: { name: 'Alice' },
    });
  });

  it('should skip input validation when no input schema provided', async () => {
    const handler = vi.fn(({ event }) => ({
      method: event.method,
    }));

    const route = defineApiRoute({ handler });
    const event = createMockEvent('GET');
    const response = await route(event);

    expect(handler).toHaveBeenCalledOnce();
    const body = await response.json();
    expect(body).toEqual({ method: 'GET' });
  });

  it('should warn on output validation failure in dev mode', async () => {
    const originalEnv = process.env['NODE_ENV'];
    process.env['NODE_ENV'] = 'development';

    const output = createMockSchema(() => ({
      issues: [{ message: 'Missing id field', path: ['id'] }],
    }));

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const handler = vi.fn(() => ({ name: 'Alice' }));

    const route = defineApiRoute({ output, handler });
    const event = createMockEvent('GET');
    await route(event);

    expect(warnSpy).toHaveBeenCalledOnce();
    expect(warnSpy.mock.calls[0][0]).toContain('output validation failed');

    warnSpy.mockRestore();
    process.env['NODE_ENV'] = originalEnv;
  });

  it('should pass Response objects through unchanged', async () => {
    const routeResponse = new Response('created', {
      status: 201,
      headers: {
        Location: '/api/users/1',
      },
    });
    const handler = vi.fn(() => routeResponse);

    const route = defineApiRoute({ handler });
    const response = await route(createMockEvent('POST', { name: 'Alice' }));

    expect(response).toBe(routeResponse);
    expect(response.status).toBe(201);
    expect(response.headers.get('Location')).toBe('/api/users/1');
    expect(await response.text()).toBe('created');
  });

  it('should skip output validation for raw Response returns', async () => {
    const originalEnv = process.env['NODE_ENV'];
    process.env['NODE_ENV'] = 'development';

    const output = createMockSchema(() => ({
      issues: [{ message: 'Should not validate raw responses' }],
    }));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const route = defineApiRoute({
      output,
      handler: () => new Response('ok', { status: 202 }),
    });

    const response = await route(createMockEvent('GET'));

    expect(response.status).toBe(202);
    expect(warnSpy).not.toHaveBeenCalled();

    warnSpy.mockRestore();
    process.env['NODE_ENV'] = originalEnv;
  });

  it('should skip output validation in production', async () => {
    const originalEnv = process.env['NODE_ENV'];
    process.env['NODE_ENV'] = 'production';

    const output = createMockSchema(() => ({
      issues: [{ message: 'Should not fire' }],
    }));

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const handler = vi.fn(() => ({ name: 'Alice' }));

    const route = defineApiRoute({ output, handler });
    const event = createMockEvent('GET');
    await route(event);

    expect(warnSpy).not.toHaveBeenCalled();

    warnSpy.mockRestore();
    process.env['NODE_ENV'] = originalEnv;
  });

  it('should handle PUT requests with body validation', async () => {
    const input = createMockSchema<{ name: string }>((value) => ({
      value: value as { name: string },
    }));

    const handler = vi.fn(({ data }) => ({ updated: true, name: data.name }));

    const route = defineApiRoute({ input, handler });
    const event = createMockEvent('PUT', { name: 'Updated' });
    const response = await route(event);

    expect(handler).toHaveBeenCalledOnce();
    expect(handler.mock.calls[0][0].data).toEqual({ name: 'Updated' });
    expect(response.status).toBe(200);
  });

  it('should handle PATCH requests with body validation', async () => {
    const input = createMockSchema<{ status: string }>((value) => ({
      value: value as { status: string },
    }));

    const handler = vi.fn(({ data }) => ({ patched: true, ...data }));

    const route = defineApiRoute({ input, handler });
    const event = createMockEvent('PATCH', { status: 'active' });
    await route(event);

    expect(handler.mock.calls[0][0].data).toEqual({ status: 'active' });
  });

  it('should handle DELETE with no input schema', async () => {
    const handler = vi.fn(() => ({ deleted: true }));

    const route = defineApiRoute({ handler });
    const event = createMockEvent('DELETE');
    const response = await route(event);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ deleted: true });
  });

  it('should handle empty query string on GET', async () => {
    const input = createMockSchema<Record<string, string>>((value) => ({
      value: value as Record<string, string>,
    }));

    const handler = vi.fn(({ data }) => data);

    const route = defineApiRoute({ input, handler });
    const event = createMockEvent(
      'GET',
      undefined,
      'application/json',
      'http://localhost/api/test',
    );
    await route(event);

    expect(handler.mock.calls[0][0].data).toEqual({});
  });

  it('should handle query params with encoded characters', async () => {
    const input = createMockSchema<{ q: string }>((value) => ({
      value: value as { q: string },
    }));

    const handler = vi.fn(({ data }) => data);

    const route = defineApiRoute({ input, handler });
    const event = createMockEvent(
      'GET',
      undefined,
      'application/json',
      'http://localhost/api/search?q=hello%20world',
    );
    await route(event);

    expect(handler.mock.calls[0][0].data).toEqual({ q: 'hello world' });
  });

  it('should preserve repeated query params as arrays', async () => {
    const input = createMockSchema<{ tag: string[] }>((value) => ({
      value: value as { tag: string[] },
    }));

    const handler = vi.fn(({ data }) => data);
    const route = defineApiRoute({ input, handler });

    await route(
      createMockEvent(
        'GET',
        undefined,
        'application/json',
        'http://localhost/api/search?tag=angular&tag=analog',
      ),
    );

    expect(handler.mock.calls[0][0].data).toEqual({
      tag: ['angular', 'analog'],
    });
  });

  it('should handle schema that transforms values', async () => {
    const input = createMockSchema<{ id: number }>((value) => {
      const v = value as { id: string };
      return { value: { id: parseInt(v.id, 10) } };
    });

    const handler = vi.fn(({ data }) => data);

    const route = defineApiRoute({ input, handler });
    const event = createMockEvent('POST', { id: '123' });
    await route(event);

    expect(handler.mock.calls[0][0].data).toEqual({ id: 123 });
  });

  it('should include path info in output validation warning', async () => {
    const originalEnv = process.env['NODE_ENV'];
    process.env['NODE_ENV'] = 'development';

    const output = createMockSchema(() => ({
      issues: [{ message: 'Invalid type', path: ['user', { key: 'name' }] }],
    }));

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const route = defineApiRoute({ output, handler: () => ({}) });
    await route(createMockEvent('GET'));

    expect(warnSpy.mock.calls[0][0]).toContain('user.name');

    warnSpy.mockRestore();
    process.env['NODE_ENV'] = originalEnv;
  });

  it('should handle POST with unparseable body gracefully', async () => {
    const input = createMockSchema<Record<string, unknown>>((value) => ({
      value: value as Record<string, unknown>,
    }));

    const handler = vi.fn(({ data }) => data);

    const route = defineApiRoute({ input, handler });
    const event = {
      method: 'POST',
      headers: new Headers({ 'content-type': 'text/plain' }),
      request: new Request('http://localhost/api/test', {
        method: 'POST',
        headers: { 'content-type': 'text/plain' },
        body: 'not json at all',
      }),
    } as any;

    await route(event);
    expect(handler.mock.calls[0][0].data).toEqual({});
  });

  it('should preserve repeated form values as arrays', async () => {
    const input = createMockSchema<{ role: string[] }>((value) => ({
      value: value as { role: string[] },
    }));
    const handler = vi.fn(({ data }) => data);

    const formBody = new URLSearchParams();
    formBody.append('role', 'admin');
    formBody.append('role', 'editor');

    const route = defineApiRoute({ input, handler });
    await route(
      createMockEvent('POST', formBody, 'application/x-www-form-urlencoded'),
    );

    expect(handler.mock.calls[0][0].data).toEqual({
      role: ['admin', 'editor'],
    });
  });

  it('should preserve repeated file fields as arrays', async () => {
    const input = createMockSchema<{ files: File[] }>((value) => ({
      value: value as { files: File[] },
    }));
    const handler = vi.fn(({ data }) => data);
    const formData = new FormData();
    formData.append('files', new File(['first'], 'first.txt'));
    formData.append('files', new File(['second'], 'second.txt'));
    const requestHeaders = new Headers({
      'content-type': 'multipart/form-data; boundary=test',
    });
    const request = {
      headers: requestHeaders,
      url: 'http://localhost/api/upload',
      formData: async () => formData,
      json: async () => {
        throw new Error('json should not be called for multipart requests');
      },
    } as any;
    const event = {
      method: 'POST',
      headers: requestHeaders,
      request,
    } as any;

    const route = defineApiRoute({ input, handler });
    await route(event);

    expect(handler.mock.calls[0][0].data.files).toHaveLength(2);
    expect(
      handler.mock.calls[0][0].data.files.map((file: File) => file.name),
    ).toEqual(['first.txt', 'second.txt']);
  });

  it('should pass event object to handler', async () => {
    const handler = vi.fn(({ event }) => ({ method: event.method }));

    const route = defineApiRoute({ handler });
    const event = createMockEvent('POST', { test: true });
    await route(event);

    expect(handler.mock.calls[0][0].event).toBe(event);
  });

  it('should handle HEAD request same as GET for query validation', async () => {
    const input = createMockSchema<{ token: string }>((value) => ({
      value: value as { token: string },
    }));

    const handler = vi.fn(({ data }) => data);

    const route = defineApiRoute({ input, handler });
    const event = createMockEvent(
      'HEAD',
      undefined,
      'application/json',
      'http://localhost/api/check?token=abc',
    );
    await route(event);

    expect(handler.mock.calls[0][0].data).toEqual({ token: 'abc' });
  });
});
