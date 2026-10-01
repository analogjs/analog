// @vitest-environment node

import { createApp, createRouter, defineEventHandler, toWebHandler } from 'h3';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { defineAction, defineApiRoute, json, redirect } from './index';
import type { PageServerAction } from './index';

describe('typed helpers with h3 v1', () => {
  it('validates API params, query and body through an h3 route', async () => {
    const app = createApp();
    const router = createRouter();
    router.post(
      '/users/:id',
      defineEventHandler(
        defineApiRoute({
          params: z.object({ id: z.coerce.number() }),
          query: z.object({ tag: z.array(z.string()) }),
          body: z.object({ count: z.coerce.number() }),
          handler: ({ params, query, body }) => ({ params, query, body }),
        }),
      ),
    );
    app.use(router);

    const response = await toWebHandler(app)(
      new Request('http://localhost/users/42?tag=a&tag=b', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ count: '3' }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      params: { id: 42 },
      query: { tag: ['a', 'b'] },
      body: { count: 3 },
    });
  });

  it('validates separate schemas even when input is configured', async () => {
    const handler = vi.fn(() => ({ ok: true }));
    const app = createApp().use(
      defineEventHandler(
        defineApiRoute({
          input: z.object({ name: z.string() }),
          query: z.object({ token: z.literal('valid') }),
          handler,
        }),
      ),
    );

    const response = await toWebHandler(app)(
      new Request('http://localhost/?token=invalid', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Analog' }),
      }),
    );

    expect(response.status).toBe(422);
    expect(response.headers.get('X-Analog-Errors')).toBe('true');
    expect(handler).not.toHaveBeenCalled();
  });

  it('retains transformed input data while independently validating the body', async () => {
    const app = createApp().use(
      defineEventHandler(
        defineApiRoute({
          input: z
            .object({ count: z.coerce.number() })
            .transform(({ count }) => count),
          body: z.object({ count: z.string() }),
          handler: ({ data, body }) => ({ data, body }),
        }),
      ),
    );
    const response = await toWebHandler(app)(
      new Request('http://localhost/', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ count: '3' }),
      }),
    );
    expect(await response.json()).toEqual({ data: 3, body: { count: '3' } });
  });

  it('parses multipart data once when input and body schemas are both configured', async () => {
    const app = createApp().use(
      defineEventHandler(
        defineApiRoute({
          input: z.object({ count: z.coerce.number() }),
          body: z.object({ count: z.string() }),
          handler: ({ data, body }) => ({ data, body }),
        }),
      ),
    );
    const form = new FormData();
    form.append('count', '3');
    const response = await toWebHandler(app)(
      new Request('http://localhost/', { method: 'POST', body: form }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: { count: 3 },
      body: { count: '3' },
    });
  });

  it('passes repeated multipart values and files to a page action', async () => {
    const action = defineAction({
      schema: z.object({
        role: z.array(z.string()),
        files: z.array(z.instanceof(File)),
      }),
      handler: ({ data, event, req, res }) => {
        expect(req).toBe(event.node.req);
        expect(res).toBe(event.node.res);
        return json({
          roles: data.role,
          files: data.files.map((file) => file.name),
        });
      },
    });
    const app = createApp().use(
      defineEventHandler((event) =>
        action({
          params: event.context.params,
          event,
          req: event.node.req,
          res: event.node.res,
          fetch: vi.fn() as unknown as PageServerAction['fetch'],
        }),
      ),
    );
    const form = new FormData();
    form.append('role', 'admin');
    form.append('role', 'editor');
    form.append('files', new File(['a'], 'a.txt'));
    form.append('files', new File(['b'], 'b.txt'));

    const response = await toWebHandler(app)(
      new Request('http://localhost/newsletter', {
        method: 'POST',
        body: form,
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      roles: ['admin', 'editor'],
      files: ['a.txt', 'b.txt'],
    });
  });

  it('returns form validation issues through the existing action response contract', async () => {
    const handler = vi.fn(() => redirect('/thanks'));
    const action = defineAction({
      schema: z.object({ email: z.string().email() }),
      handler,
    });
    const app = createApp().use(
      defineEventHandler((event) =>
        action({
          params: event.context.params,
          event,
          req: event.node.req,
          res: event.node.res,
          fetch: vi.fn() as unknown as PageServerAction['fetch'],
        }),
      ),
    );
    const response = await toWebHandler(app)(
      new Request('http://localhost/newsletter', {
        method: 'POST',
        body: new URLSearchParams({ email: 'invalid' }),
      }),
    );

    expect(response.status).toBe(422);
    expect(response.headers.get('X-Analog-Errors')).toBe('true');
    expect(await response.json()).toEqual([
      expect.objectContaining({ path: ['email'] }),
    ]);
    expect(handler).not.toHaveBeenCalled();
  });

  it('preserves field names that also exist on Object.prototype', async () => {
    const app = createApp().use(
      defineEventHandler(
        defineApiRoute({
          input: z.unknown(),
          handler: ({ data }) => data,
        }),
      ),
    );
    const response = await toWebHandler(app)(
      new Request(
        'http://localhost/?constructor=one&constructor=two&__proto__=value',
      ),
    );
    expect(await response.json()).toEqual(
      JSON.parse('{"constructor":["one","two"],"__proto__":"value"}'),
    );
  });
});
