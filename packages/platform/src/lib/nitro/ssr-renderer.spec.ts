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
