import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HMRPayload, ViteDevServer } from 'vite';
import { createHotUpdateBatcher } from './hot-update-batch';

describe('hot-update batches', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function setup(
    compile = vi.fn<(ids: string[]) => Promise<void>>().mockResolvedValue(),
  ) {
    const send = vi.fn();
    const ws = { send };
    const server = {
      ws,
      environments: { client: { hot: ws } },
    } as unknown as ViteDevServer;
    const batcher = createHotUpdateBatcher(compile);
    batcher.configureServer(server);
    return { batcher, compile, server, send };
  }

  it('debounces a burst and compiles the union of modified files', async () => {
    const { batcher, compile } = setup();
    const first = batcher.schedule('/a.ts', ['/a.ts', '/shared.ts']);
    await vi.advanceTimersByTimeAsync(90);
    const second = batcher.schedule('/b.ts', ['/b.ts', '/shared.ts']);
    expect(second).toBe(first);
    await vi.advanceTimersByTimeAsync(90);
    expect(compile).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(10);
    await Promise.all([first, second]);
    expect(compile).toHaveBeenCalledExactlyOnceWith([
      '/a.ts',
      '/shared.ts',
      '/b.ts',
    ]);
    batcher.close();
  });

  it('keeps transforms waiting for edits queued during an ongoing compilation', async () => {
    let finish!: () => void;
    const compile = vi
      .fn<(ids: string[]) => Promise<void>>()
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            finish = resolve;
          }),
      )
      .mockResolvedValue(undefined);
    const { batcher } = setup(compile);
    const first = batcher.schedule('/a.ts', ['/a.ts']);
    await vi.advanceTimersByTimeAsync(100);
    const waiting = vi.fn();
    const transform = batcher.wait().then(waiting);
    const second = batcher.schedule('/b.ts', ['/b.ts']);
    finish();
    await first;
    expect(waiting).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(100);
    await Promise.all([second, transform]);
    expect(compile.mock.calls).toEqual([[['/a.ts']], [['/b.ts']]]);
    expect(waiting).toHaveBeenCalledOnce();
    batcher.close();
  });

  it('rejects every participant on failure and accepts the next edit', async () => {
    const error = new Error('compile failed');
    const compile = vi
      .fn<(ids: string[]) => Promise<void>>()
      .mockRejectedValueOnce(error)
      .mockResolvedValue(undefined);
    const { batcher } = setup(compile);
    const first = batcher.schedule('/a.ts', ['/a.ts']);
    const second = batcher.schedule('/b.ts', ['/b.ts']);
    const failures = Promise.allSettled([first, second, batcher.wait()]);
    await vi.advanceTimersByTimeAsync(100);
    expect(await failures).toEqual(
      Array(3).fill({ status: 'rejected', reason: error }),
    );
    const next = batcher.schedule('/a.ts', ['/a.ts']);
    await vi.advanceTimersByTimeAsync(100);
    await next;
    expect(compile).toHaveBeenCalledTimes(2);
    batcher.close();
  });

  it('sends one reload after compilation and preserves later edits', async () => {
    const { batcher, server, send } = setup();
    const first = batcher.schedule('/a.html', ['/a.ts']);
    const second = batcher.schedule('/b.ts', ['/b.ts']);
    const notify = Promise.all(
      [first, second].map(async (promise, i) => {
        await promise;
        server.ws.send({
          type: 'full-reload',
          path: '*',
          triggeredBy: i === 0 ? '/a.html' : '/b.ts',
        });
      }),
    );
    await vi.advanceTimersByTimeAsync(101);
    await notify;
    expect(send).toHaveBeenCalledOnce();
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'full-reload' }),
    );
    const later = batcher.schedule('/a.ts', ['/a.ts']);
    const notification = later.then(() =>
      server.ws.send({ type: 'full-reload', triggeredBy: '/a.ts' }),
    );
    await vi.advanceTimersByTimeAsync(101);
    await notification;
    expect(send).toHaveBeenCalledTimes(2);
    batcher.close();
  });

  it('merges Vite updates and deduplicates component updates without losing components', async () => {
    const { batcher, server, send } = setup();
    const compile = batcher.schedule('/a.ts', ['/a.ts', '/b.ts']);
    const update = (path: string, timestamp: number) => ({
      type: 'js-update' as const,
      path,
      acceptedPath: path,
      timestamp,
    });
    server.ws.send({ type: 'update', updates: [update('/a.ts', 1)] });
    server.ws.send({
      type: 'update',
      updates: [update('/a.ts', 2), update('/b.ts', 2)],
    });
    server.ws.send('angular:component-update', { id: 'a', timestamp: 1 });
    server.ws.send('angular:component-update', { id: 'a', timestamp: 2 });
    server.ws.send('angular:component-update', { id: 'b', timestamp: 2 });
    expect(send).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(101);
    await compile;
    expect(send.mock.calls).toEqual([
      [
        {
          type: 'custom',
          event: 'angular:component-update',
          data: { id: 'a', timestamp: 2 },
        },
      ],
      [
        {
          type: 'custom',
          event: 'angular:component-update',
          data: { id: 'b', timestamp: 2 },
        },
      ],
      [{ type: 'update', updates: [update('/a.ts', 2), update('/b.ts', 2)] }],
    ]);
    batcher.close();
  });

  it('lets a full reload supersede updates, but keeps page-specific reloads scoped', async () => {
    const { batcher, server, send } = setup();
    const first = batcher.schedule('/a.ts', ['/a.ts']);
    server.ws.send('angular:component-update', { id: 'a' });
    server.ws.send({
      type: 'full-reload',
      path: '/page.html',
      triggeredBy: '/a.ts',
    });
    server.ws.send({ type: 'full-reload', triggeredBy: '/a.ts' });
    await vi.advanceTimersByTimeAsync(101);
    await first;
    expect(send.mock.calls).toEqual([
      [{ type: 'full-reload', triggeredBy: '/a.ts' }],
    ]);
    send.mockClear();
    const second = batcher.schedule('/b.ts', ['/b.ts']);
    server.ws.send({
      type: 'full-reload',
      path: '/one.html',
      triggeredBy: '/b.ts',
    });
    server.ws.send({
      type: 'full-reload',
      path: '/two.html',
      triggeredBy: '/b.ts',
    });
    await vi.advanceTimersByTimeAsync(101);
    await second;
    expect(send.mock.calls).toEqual([
      [{ type: 'full-reload', path: '/one.html', triggeredBy: '/b.ts' }],
      [{ type: 'full-reload', path: '/two.html', triggeredBy: '/b.ts' }],
    ]);
    batcher.close();
  });

  it('passes CSS updates outside a batch and unrelated custom events through immediately', async () => {
    const { batcher, server, send } = setup();
    const css: HMRPayload = {
      type: 'update',
      updates: [
        {
          type: 'css-update',
          path: '/style.css',
          acceptedPath: '/style.css',
          timestamp: 1,
        },
      ],
    };
    server.ws.send(css);
    expect(send).toHaveBeenCalledWith(css);
    const compile = batcher.schedule('/a.ts', ['/a.ts']);
    server.ws.send('other-plugin', { value: 1 });
    expect(send).toHaveBeenCalledWith({
      type: 'custom',
      event: 'other-plugin',
      data: { value: 1 },
    });
    await vi.advanceTimersByTimeAsync(101);
    await compile;
    batcher.close();
  });

  it('does not recapture a flush forwarded from a separate client channel', async () => {
    const { batcher, server, send } = setup();
    batcher.close();
    server.environments.client.hot = {
      send: (payload: HMRPayload) => server.ws.send(payload),
    } as ViteDevServer['environments']['client']['hot'];
    batcher.configureServer(server);
    const compile = batcher.schedule('/a.ts', ['/a.ts']);
    server.environments.client.hot.send({
      type: 'full-reload',
      triggeredBy: '/a.ts',
    });
    await vi.advanceTimersByTimeAsync(101);
    await compile;
    expect(send).toHaveBeenCalledExactlyOnceWith({
      type: 'full-reload',
      triggeredBy: '/a.ts',
    });
    batcher.close();
  });

  it('does not delay reloads requested by unrelated files or plugins', async () => {
    const { batcher, server, send } = setup();
    const compile = batcher.schedule('/a.ts', ['/a.ts']);
    server.ws.send({ type: 'full-reload', triggeredBy: '/other.ts' });
    server.ws.send({ type: 'full-reload' });
    expect(send).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(101);
    await compile;
    expect(send).toHaveBeenCalledTimes(2);
    batcher.close();
  });

  it('sends errors immediately and discards queued updates', async () => {
    const { batcher, server, send } = setup();
    const compile = batcher.schedule('/a.ts', ['/a.ts']);
    server.ws.send({ type: 'full-reload', triggeredBy: '/a.ts' });
    server.ws.send('angular:component-update', { id: 'a', timestamp: 1 });
    server.ws.send({
      type: 'update',
      updates: [
        {
          type: 'js-update',
          path: '/a.ts',
          acceptedPath: '/a.ts',
          timestamp: 1,
        },
      ],
    });
    const error: HMRPayload = {
      type: 'error',
      err: { message: 'compile failed', stack: '' },
    };
    server.ws.send(error);
    expect(send).toHaveBeenCalledExactlyOnceWith(error);
    await vi.advanceTimersByTimeAsync(101);
    await compile;
    expect(send).toHaveBeenCalledOnce();
    batcher.close();
  });

  it('does not leave timers behind when a compilation finishes after close', async () => {
    let finish!: () => void;
    const { batcher } = setup(
      vi.fn(
        () =>
          new Promise<void>((resolve) => {
            finish = resolve;
          }),
      ),
    );
    const compile = batcher.schedule('/a.ts', ['/a.ts']);
    await vi.advanceTimersByTimeAsync(100);
    batcher.close();
    finish();
    await compile;
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cancels queued work and restores the channel on server close', async () => {
    const { batcher, compile, server, send } = setup();
    const result = Promise.allSettled([batcher.schedule('/a.ts', ['/a.ts'])]);
    batcher.close();
    expect((await result)[0].status).toBe('rejected');
    await vi.runAllTimersAsync();
    expect(compile).not.toHaveBeenCalled();
    expect(server.ws.send).toBe(send);
  });
});
