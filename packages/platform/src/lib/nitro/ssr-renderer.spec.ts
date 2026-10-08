import { describe, expect, it, vi } from 'vitest';

import { generateSsrRendererVirtual } from './analog-nitro-plugin';

const template = '<html><body><app-root></app-root></body></html>';

function createRenderer(fetch: (request: Request) => Promise<Response>) {
  const source = generateSsrRendererVirtual(template)
    .replace("import { defineHandler } from 'nitro/h3';", '')
    .replace("import ssr from '#analog/ssr';", '')
    .replace('export default', 'return');
  const evaluate = new Function('defineHandler', 'ssr', source);
  return evaluate((handler: unknown) => handler, { fetch });
}

function createEvent(ssr?: boolean) {
  return {
    req: new Request('http://localhost/client'),
    res: { headers: new Headers() },
    context: {
      routeRules: {
        headers: ssr === undefined ? {} : { 'x-analog-no-ssr': String(!ssr) },
      },
    },
  };
}

describe('SSR renderer route rules', () => {
  it.each([undefined, true])(
    'strips caller SSR hints with rule %s',
    async (ssr) => {
      const fetch = vi.fn(
        async (_request: Request) => new Response('rendered'),
      );
      const event = createEvent(ssr);
      event.req.headers.set('X-Analog-No-SSR', 'true');

      await createRenderer(fetch)(event);

      expect(fetch).toHaveBeenCalledOnce();
      expect(fetch.mock.calls[0][0].headers.has('x-analog-no-ssr')).toBe(false);
      expect(event.req.headers.get('x-analog-no-ssr')).toBe('true');
    },
  );

  it.each(['GET', 'HEAD', 'POST'])(
    'preserves a %s request adapter when filtering',
    async (method) => {
      const fetch = vi.fn(
        async (_request: Request) => new Response('rendered'),
      );
      const abort = new AbortController();
      const runtime = { node: { req: {}, res: {} } };
      const event = {
        ...createEvent(true),
        req: {
          url: 'http://localhost/page?query=1',
          method,
          headers: new Headers({
            'x-analog-no-ssr': 'true',
            'x-custom': 'retained',
          }),
          body: method === 'POST' ? new Response('request payload').body : null,
          signal: abort.signal,
          runtime,
        },
      };

      await createRenderer(fetch)(event);

      const forwarded = fetch.mock.calls[0][0];
      expect(forwarded).toBeInstanceOf(Request);
      expect(forwarded.url).toBe(event.req.url);
      expect(forwarded.method).toBe(method);
      expect(forwarded.headers.get('x-custom')).toBe('retained');
      expect(forwarded.headers.has('x-analog-no-ssr')).toBe(false);
      expect(Reflect.get(forwarded, 'runtime')).toBe(runtime);
      expect(await forwarded.text()).toBe(
        method === 'POST' ? 'request payload' : '',
      );
      const reason = new Error('disconnected');
      abort.abort(reason);
      expect(forwarded.signal.aborted).toBe(true);
      expect(forwarded.signal.reason).toBe(reason);
    },
  );

  it('returns the client template before response headers are applied', async () => {
    const fetch = vi.fn(async () => new Response('server-rendered content'));
    const render = createRenderer(fetch);
    const event = createEvent(false);
    event.req.headers.set('x-analog-no-ssr', 'false');

    expect(await render(event)).toBe(template);
    expect(fetch).not.toHaveBeenCalled();
    expect(event.res.headers.get('content-type')).toBe(
      'text/html; charset=utf-8',
    );
  });

  it('honors explicit SSR over an inherited no-SSR header', async () => {
    const response = new Response('server-rendered content');
    const fetch = vi.fn(async () => response);
    const render = createRenderer(fetch);
    const event = createEvent(true);
    event.res.headers.set('x-analog-no-ssr', 'true');

    expect(await render(event)).toBe(response);
    expect(fetch).toHaveBeenCalledWith(event.req);
  });

  it('retains the header fallback when no SSR rule is resolved', async () => {
    const fetch = vi.fn(async () => new Response('server-rendered content'));
    const render = createRenderer(fetch);
    const event = createEvent();
    event.res.headers.set('x-analog-no-ssr', 'true');

    expect(await render(event)).toBe(template);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('renders normally when no rule disables SSR', async () => {
    const response = new Response('server-rendered content');
    const fetch = vi.fn(async () => response);
    const render = createRenderer(fetch);
    const event = createEvent();

    expect(await render(event)).toBe(response);
    expect(fetch).toHaveBeenCalledWith(event.req);
  });
});
