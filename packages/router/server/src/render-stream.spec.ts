// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ServerContext } from '@analogjs/router/tokens';
import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';

const angular = vi.hoisted(() => ({
  bootstrap: vi.fn(),
  platform: vi.fn(),
  render: vi.fn(),
  buffered: vi.fn(),
  navigation: vi.fn(),
}));
vi.mock('@angular/platform-browser', () => ({
  bootstrapApplication: angular.bootstrap,
}));
vi.mock('@angular/platform-server', () => ({
  platformServer: angular.platform,
  ɵrenderInternal: angular.render,
  renderApplication: angular.buffered,
  INITIAL_CONFIG: 'initial-config',
}));
vi.mock('./provide-server-context', () => ({ provideServerContext: () => [] }));
vi.mock('./utils/reset-component-def-tviews', () => ({
  resetComponentDefTViews: vi.fn(),
}));
vi.mock('./ssr-navigation', () => ({
  createSsrNavigationTracker: () => ({
    provider: { ɵproviders: [] },
    throwIfFailed: angular.navigation,
  }),
}));

import { renderStream } from './render-stream';

class App {}
const document =
  '<html><head><title>Shell</title></head><body><app-root></app-root></body></html>';
const sockets: Socket[] = [];
function context(): ServerContext {
  const socket = new Socket();
  sockets.push(socket);
  const req = Object.assign(new IncomingMessage(socket), { originalUrl: '/' });
  return { req, res: new ServerResponse(req) };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('__analogSsrInternals', {
    collectNativeNodesInLContainer: (nodes: unknown[], output: unknown[]) =>
      output.push(...nodes),
  });
  angular.buffered.mockResolvedValue(
    '<html><head><title>Resolved</title></head><body>buffered</body></html>',
  );
  angular.render.mockResolvedValue(
    '<html><head><title>Resolved</title></head><body>authoritative</body></html>',
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  for (const socket of sockets.splice(0)) socket.destroy();
});

describe('streaming render lifetime', () => {
  it('closes an HTTP document with a safe failure trailer and disposes its platform', async () => {
    const destroyed = Promise.withResolvers<void>();
    angular.platform.mockReturnValue({ destroy: () => destroyed.resolve() });
    angular.bootstrap.mockRejectedValue(new Error('private-render-detail'));
    const reader = (
      await renderStream(App, { providers: [] })('/', document, {
        ...context(),
        renderErrorsAsHtml: true,
      })
    ).getReader();
    let html = '';
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      html += new TextDecoder().decode(chunk.value);
    }
    await destroyed.promise;
    expect(html).toContain('<script data-analog-error>');
    expect(html).not.toContain('private-render-detail');
    expect(angular.render).not.toHaveBeenCalled();
  });

  it('fails the response body and disposes the platform when navigation fails after the shell', async () => {
    const failure = Object.assign(new Error('navigation failed'), {
      statusCode: 503,
    });
    const destroyed = Promise.withResolvers<void>();
    angular.platform.mockReturnValue({ destroy: () => destroyed.resolve() });
    angular.bootstrap.mockResolvedValue({ whenStable: async () => {} });
    angular.navigation.mockImplementation(() => {
      throw failure;
    });
    const reader = (
      await renderStream(App, { providers: [] })('/', document, context())
    ).getReader();
    expect(new TextDecoder().decode((await reader.read()).value)).toContain(
      'data-analog-stream',
    );
    await expect(reader.read()).rejects.toBe(failure);
    await destroyed.promise;
    expect(angular.render).not.toHaveBeenCalled();
  });

  it('flushes the shell before application stability and destroys the platform after the tail', async () => {
    const stable = Promise.withResolvers<void>();
    const destroyed = Promise.withResolvers<void>();
    const destroy = vi.fn(() => destroyed.resolve());
    angular.platform.mockReturnValue({ destroy });
    angular.bootstrap.mockResolvedValue({ whenStable: () => stable.promise });
    const reader = (
      await renderStream(App, { providers: [] })('/', document, context())
    ).getReader();
    expect(new TextDecoder().decode((await reader.read()).value)).toContain(
      'data-analog-stream',
    );
    expect(destroy).not.toHaveBeenCalled();
    stable.resolve();
    expect(new TextDecoder().decode((await reader.read()).value)).toContain(
      'authoritative',
    );
    expect((await reader.read()).done).toBe(true);
    await destroyed.promise;
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it('destroys the platform promptly when the body is cancelled while stability is pending', async () => {
    const stable = Promise.withResolvers<void>();
    const destroyed = Promise.withResolvers<void>();
    const destroy = vi.fn(() => destroyed.resolve());
    angular.platform.mockReturnValue({ destroy });
    angular.bootstrap.mockResolvedValue({ whenStable: () => stable.promise });
    const reader = (
      await renderStream(App, { providers: [] })('/', document, context())
    ).getReader();
    await reader.read();
    await reader.cancel('disconnected');
    await destroyed.promise;
    expect(destroy).toHaveBeenCalledTimes(1);
    stable.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(angular.render).not.toHaveBeenCalled();
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it('uses trusted route context when no Node response header exists', async () => {
    const result = await renderStream(App, { providers: [] })('/', document, {
      ...context(),
      streaming: false,
    });
    expect(await new Response(result).text()).toContain('buffered');
    expect(angular.platform).not.toHaveBeenCalled();
  });

  it('aborts a render through the host signal and removes its listener', async () => {
    const stable = Promise.withResolvers<void>();
    const destroyed = Promise.withResolvers<void>();
    angular.platform.mockReturnValue({ destroy: () => destroyed.resolve() });
    angular.bootstrap.mockResolvedValue({ whenStable: () => stable.promise });
    const abort = new AbortController();
    const removed = vi.spyOn(abort.signal, 'removeEventListener');
    const reader = (
      await renderStream(App, { providers: [] })('/', document, {
        ...context(),
        signal: abort.signal,
      })
    ).getReader();
    await reader.read();
    const reason = new Error('host disconnected');
    abort.abort(reason);
    await expect(reader.read()).rejects.toBe(reason);
    await destroyed.promise;
    expect(removed).toHaveBeenCalledWith('abort', expect.any(Function));
    stable.resolve();
  });

  it('does not create a platform for a request that is already aborted', async () => {
    const abort = new AbortController();
    abort.abort();
    await expect(
      renderStream(App, { providers: [] })('/', document, {
        ...context(),
        signal: abort.signal,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(angular.platform).not.toHaveBeenCalled();
    expect(angular.buffered).not.toHaveBeenCalled();
  });

  it('propagates a bootstrap error after the shell and still destroys the platform', async () => {
    const started = Promise.withResolvers<void>();
    const destroyed = Promise.withResolvers<void>();
    angular.platform.mockReturnValue({ destroy: () => destroyed.resolve() });
    angular.bootstrap.mockReturnValue(started.promise);
    const reader = (
      await renderStream(App, { providers: [] })('/', document, context())
    ).getReader();
    await reader.read();
    const failure = new Error('bootstrap failed');
    started.reject(failure);
    await expect(reader.read()).rejects.toBe(failure);
    await destroyed.promise;
  });

  it('escapes text nodes when serializing a deferred block', async () => {
    const stable = Promise.withResolvers<void>();
    angular.platform.mockReturnValue({ destroy: vi.fn() });
    angular.bootstrap.mockImplementation(async () => {
      const capture = Reflect.get(globalThis, '__analogSsrDeferCapture');
      capture({
        ssrUniqueId: 'block',
        lContainer: [
          { nodeType: 3, data: '<img src=x onerror=alert(1)>&' },
          { nodeType: 8, data: 'container' },
          { nodeType: 1, outerHTML: '<p>safe element</p>' },
        ],
      });
      return { whenStable: () => stable.promise };
    });
    const reader = (
      await renderStream(App, { providers: [] })('/', document, context())
    ).getReader();
    await reader.read();
    const block = new TextDecoder().decode((await reader.read()).value);
    expect(block).toContain('&lt;img src=x onerror=alert(1)&gt;&amp;');
    expect(block).not.toContain('<img');
    expect(block).not.toContain('container');
    expect(block).toContain('<p>safe element</p>');
    stable.resolve();
    while (!(await reader.read()).done) {
      /* Drain the authoritative tail. */
    }
  });

  it('keeps concurrent block captures in the render that scheduled them', async () => {
    const first = Promise.withResolvers<void>();
    const second = Promise.withResolvers<void>();
    angular.platform.mockReturnValue({ destroy: vi.fn() });
    const captureBlock = (value: string) => {
      Reflect.get(
        globalThis,
        '__analogSsrDeferCapture',
      )({
        ssrUniqueId: value,
        lContainer: [{ nodeType: 1, outerHTML: `<p>${value}</p>` }],
      });
      return { whenStable: async () => undefined };
    };
    angular.bootstrap
      .mockImplementationOnce(() =>
        first.promise.then(() => captureBlock('first')),
      )
      .mockImplementationOnce(() =>
        second.promise.then(() => captureBlock('second')),
      );
    const render = renderStream(App, { providers: [] });
    const a = new Response(await render('/first', document, context())).text();
    const b = new Response(await render('/second', document, context())).text();
    second.resolve();
    const secondHtml = await b;
    expect(secondHtml).toContain('<p>second</p>');
    expect(secondHtml).not.toContain('<p>first</p>');
    first.resolve();
    const firstHtml = await a;
    expect(firstHtml).toContain('<p>first</p>');
    expect(firstHtml).not.toContain('<p>second</p>');
  });
});
