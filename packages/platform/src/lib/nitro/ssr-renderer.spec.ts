import { describe, expect, it, vi } from 'vitest';

import { generateSsrRendererVirtual } from './analog-nitro-plugin';

const template = '<html><body><app-root></app-root></body></html>';

function createRenderer(
  fetch: (request: Request) => Promise<Response>,
  prerender = false,
) {
  const source = generateSsrRendererVirtual(template, prerender)
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
  it('buffers the prerender instance even when a route explicitly enables streaming', async () => {
    const fetch = vi.fn(
      async (_request: Request) => new Response('complete document'),
    );
    const render = createRenderer(fetch, true);
    const event = createEvent();
    event.context.routeRules.headers['x-analog-no-streaming'] = 'false';
    await render(event);
    expect(fetch.mock.calls[0][0].headers.get('x-analog-no-streaming')).toBe(
      'true',
    );
  });

  it('accepts a server Request adapter and preserves runtime, URL and abort signal', async () => {
    const fetch = vi.fn(async (_request: Request) => new Response('rendered'));
    const render = createRenderer(fetch);
    const abort = new AbortController();
    const runtime = { node: { req: {}, res: {} } };
    const event = {
      ...createEvent(),
      req: {
        url: 'http://localhost/stream?query=1',
        method: 'GET',
        headers: new Headers(),
        signal: abort.signal,
        runtime,
      },
    };
    event.context.routeRules.headers['x-analog-no-streaming'] = 'true';
    await render(event);
    const forwarded = fetch.mock.calls[0][0];
    expect(forwarded.url).toBe(event.req.url);
    expect(Reflect.get(forwarded, 'runtime')).toBe(runtime);
    abort.abort();
    expect(forwarded.signal.aborted).toBe(true);
  });
  it('forwards the resolved streaming rule before response headers are applied', async () => {
    const fetch = vi.fn(async () => new Response('server-rendered content'));
    const render = createRenderer(fetch);
    const event = createEvent();
    event.context.routeRules.headers['x-analog-no-streaming'] = 'true';
    await render(event);
    expect(fetch.mock.calls[0][0].headers.get('x-analog-no-streaming')).toBe(
      'true',
    );
  });

  it('resets caller-supplied streaming policy hints when no rule opts out', async () => {
    const fetch = vi.fn(
      async (_request: Request) => new Response('server-rendered content'),
    );
    const render = createRenderer(fetch);
    const event = createEvent();
    event.req.headers.set('x-analog-no-streaming', 'true');
    await render(event);
    expect(
      fetch.mock.calls[0][0].headers.get('x-analog-no-streaming'),
    ).toBeNull();
  });

  it('does not forward caller-controlled no-SSR hints to the internal renderer', async () => {
    const fetch = vi.fn(
      async (_request: Request) => new Response('server-rendered content'),
    );
    const render = createRenderer(fetch);
    const event = createEvent();
    event.req.headers.set('x-analog-no-ssr', 'true');
    await render(event);
    expect(fetch.mock.calls[0][0].headers.get('x-analog-no-ssr')).toBeNull();
  });

  it('an explicit streaming opt-in overrides an inherited response hint', async () => {
    const fetch = vi.fn(
      async (_request: Request) => new Response('server-rendered content'),
    );
    const render = createRenderer(fetch);
    const event = createEvent();
    event.context.routeRules.headers['x-analog-no-streaming'] = 'false';
    event.res.headers.set('x-analog-no-streaming', 'true');
    await render(event);
    expect(fetch.mock.calls[0][0].headers.get('x-analog-no-streaming')).toBe(
      'false',
    );
  });
  it('returns the client template before response headers are applied', async () => {
    const fetch = vi.fn(async () => new Response('server-rendered content'));
    const render = createRenderer(fetch);
    const event = createEvent(false);

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
