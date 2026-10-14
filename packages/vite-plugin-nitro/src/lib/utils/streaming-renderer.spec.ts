import { EventEmitter, once } from 'node:events';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  createApp,
  eventHandler,
  getResponseHeader,
  setResponseHeader,
  toNodeListener,
} from 'h3';
import { describe, expect, it, vi } from 'vitest';
import { createSsrStreamRenderer } from './renderers';

function createRenderer(prerender = false, noStreaming = false, http = false) {
  const response = Object.assign(new EventEmitter(), { writableEnded: false });
  const headers = new Map<string, string>();
  if (noStreaming) headers.set('x-analog-no-streaming', 'true');
  const renderer = vi.fn<
    (
      url: string,
      template: string,
      context: {
        streaming: boolean;
        signal: AbortSignal;
        renderErrorsAsHtml: boolean;
      },
    ) => Promise<ReadableStream<Uint8Array>>
  >(
    async () =>
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('<html>complete</html>'));
          controller.close();
        },
      }),
  );
  const handler = new Function(
    'eventHandler',
    'getResponseHeader',
    'setResponseHeader',
    'renderer',
    'template',
    createSsrStreamRenderer(prerender)
      .replace(/import[^;]+;/g, '')
      .replace('export default', 'return'),
  )(
    http ? eventHandler : (handler: unknown) => handler,
    http
      ? getResponseHeader
      : (_event: unknown, name: string) => headers.get(name),
    http
      ? setResponseHeader
      : (_event: unknown, name: string, value: string) =>
          headers.set(name, value),
    renderer,
    '<app-root></app-root>',
  );
  const request = {
    url: '/dashboard',
    headers: { 'x-analog-no-streaming': 'true', 'x-analog-no-ssr': 'true' },
  };
  return {
    handler,
    run: () => handler({ node: { req: request, res: response } }),
    renderer,
    response,
    headers,
  };
}

describe('streaming HTTP renderer', () => {
  it('propagates a real HTTP disconnect through h3 to the renderer', async () => {
    const { handler, renderer } = createRenderer(false, false, true);
    const aborted = Promise.withResolvers<void>();
    renderer.mockImplementation(
      async (_url, _template, { signal }) =>
        new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('shell'));
            signal.addEventListener(
              'abort',
              () => {
                controller.close();
                aborted.resolve();
              },
              { once: true },
            );
          },
        }),
    );
    const server = createServer(toNodeListener(createApp().use(handler)));
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    try {
      const { port } = server.address() as AddressInfo;
      const response = await fetch(`http://127.0.0.1:${port}/`);
      const reader = response.body!.getReader();
      expect(new TextDecoder().decode((await reader.read()).value)).toBe(
        'shell',
      );
      await reader.cancel();
      await aborted.promise;
      expect(renderer.mock.calls[0][2].signal.aborted).toBe(true);
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });

  it('uses response policy and prevents progressive response caching and compression', async () => {
    const { run, renderer, response, headers } = createRenderer();
    const body = await run();
    expect(body).toBeInstanceOf(ReadableStream);
    expect(renderer.mock.calls[0][2]).toMatchObject({
      streaming: true,
      renderErrorsAsHtml: true,
    });
    expect(headers.get('content-encoding')).toBe('identity');
    expect(headers.get('cache-control')).toBe('no-store, no-transform');
    response.writableEnded = true;
    response.emit('finish');
    expect(response.listenerCount('close')).toBe(0);
    expect(renderer.mock.calls[0][2].signal.aborted).toBe(false);
  });

  it.each([
    { prerender: true, routeDisabled: false },
    { prerender: false, routeDisabled: true },
  ])(
    'buffers the complete document for %j',
    async ({ prerender, routeDisabled }) => {
      const { run, renderer, response, headers } = createRenderer(
        prerender,
        routeDisabled,
      );
      expect(await run()).toBe('<html>complete</html>');
      expect(renderer.mock.calls[0][2].streaming).toBe(false);
      expect(headers.has('content-encoding')).toBe(false);
      expect(headers.has('cache-control')).toBe(false);
      response.emit('finish');
    },
  );

  it('aborts pending rendering when the HTTP client disconnects', async () => {
    const { run, renderer, response } = createRenderer();
    const pending = Promise.withResolvers<ReadableStream<Uint8Array>>();
    renderer.mockReturnValue(pending.promise);
    const result = run();
    const signal = renderer.mock.calls[0][2].signal;
    response.emit('close');
    expect(signal.aborted).toBe(true);
    expect(response.listenerCount('finish')).toBe(0);
    pending.reject(signal.reason);
    await expect(result).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('removes disconnect listeners when rendering fails before returning a body', async () => {
    const { run, renderer, response } = createRenderer();
    renderer.mockRejectedValue(new Error('bootstrap failed'));
    await expect(run()).rejects.toThrow('bootstrap failed');
    expect(response.listenerCount('close')).toBe(0);
    expect(response.listenerCount('finish')).toBe(0);
  });
});
