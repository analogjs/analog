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

function createEvent(headers: Record<string, string> = {}) {
  return {
    req: new Request('http://localhost/client'),
    res: { headers: new Headers() },
    context: {
      routeRules: {
        headers,
      },
    },
  };
}

describe('Streaming renderer route rules', () => {
  it.each([
    { rule: undefined, prerender: false, expected: null },
    { rule: 'true', prerender: false, expected: 'true' },
    { rule: 'false', prerender: false, expected: 'false' },
    { rule: 'false', prerender: true, expected: 'true' },
  ])(
    'filters caller SSR hints while preserving $expected streaming policy (prerender=$prerender)',
    async ({ rule, prerender, expected }) => {
      const fetch = vi.fn(
        async (_request: Request) => new Response('rendered'),
      );
      const event = createEvent({ 'x-analog-no-ssr': 'false' });
      event.req.headers.set('x-analog-no-ssr', 'true');
      event.req.headers.set('x-analog-no-streaming', 'true');
      if (rule !== undefined)
        event.context.routeRules.headers['x-analog-no-streaming'] = rule;

      await createRenderer(fetch, prerender)(event);

      expect(fetch).toHaveBeenCalledOnce();
      expect(fetch.mock.calls[0][0].headers.get('x-analog-no-ssr')).toBeNull();
      expect(fetch.mock.calls[0][0].headers.get('x-analog-no-streaming')).toBe(
        expected,
      );
    },
  );

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
});
