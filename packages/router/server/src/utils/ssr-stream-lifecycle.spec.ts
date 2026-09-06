import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSsrStream } from './ssr-stream-lifecycle';

afterEach(() => vi.useRealTimers());

describe('SSR stream ownership', () => {
  it('keeps an edge request alive until cleanup and stops its idle comments on cancellation', async () => {
    vi.useFakeTimers();
    const gate = Promise.withResolvers<void>();
    const cleanup = Promise.withResolvers<void>();
    const waitUntil = vi.fn<(promise: Promise<void>) => void>();
    const destroy = vi.fn(() => cleanup.promise);
    try {
      const body = createSsrStream({
        waitUntil,
        destroy,
        render: async (writer) => {
          writer.enqueue('shell');
          await gate.promise;
        },
      });
      expect(waitUntil).toHaveBeenCalledTimes(1);
      const reader = body.getReader();
      expect(new TextDecoder().decode((await reader.read()).value)).toBe(
        'shell',
      );
      await vi.advanceTimersByTimeAsync(1000);
      expect(new TextDecoder().decode((await reader.read()).value)).toBe(
        '<!--analog-render-pending-->',
      );
      const lifetime = waitUntil.mock.calls[0][0];
      let completed = false;
      void lifetime.then(() => {
        completed = true;
      });
      const cancelled = reader.cancel();
      await Promise.resolve();
      expect(completed).toBe(false);
      expect(destroy).toHaveBeenCalledTimes(1);
      cleanup.resolve();
      await cancelled;
      await lifetime;
      expect(completed).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      gate.resolve();
      cleanup.resolve();
      vi.useRealTimers();
    }
  });

  it('flushes queued blocks before the tail', async () => {
    const destroy = vi.fn(async () => undefined);
    const body = createSsrStream({
      destroy,
      async render(writer) {
        writer.enqueue('shell');
        writer.scheduleBlock(() => 'block');
        await writer.finishBlocks();
        writer.enqueue('tail');
      },
    });
    expect(await new Response(body).text()).toBe('shellblocktail');
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it('cancels queued flushes without serializing disposed DOM', async () => {
    const queued = Promise.withResolvers<void>();
    const serialize = vi.fn(() => 'block');
    const destroy = vi.fn(async () => undefined);
    const body = createSsrStream({
      destroy,
      async render(writer) {
        writer.enqueue('shell');
        writer.scheduleBlock(serialize);
        queued.resolve();
        await writer.finishBlocks();
        writer.enqueue('tail');
      },
    });
    await queued.promise;
    await body.cancel();
    expect(serialize).not.toHaveBeenCalled();
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it('surfaces block serialization errors and completes cleanup without an unhandled timer error', async () => {
    const failed = new Error('DOM serialization failed');
    const destroy = vi.fn(async () => undefined);
    const body = createSsrStream({
      destroy,
      async render(writer) {
        writer.scheduleBlock(() => {
          throw failed;
        });
        await writer.finishBlocks();
        writer.enqueue('tail');
      },
    });
    await expect(new Response(body).text()).rejects.toBe(failed);
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it('does not close successfully when platform cleanup fails', async () => {
    const failed = new Error('platform disposal failed');
    const body = createSsrStream({
      destroy: async () => {
        throw failed;
      },
      render: async (writer) => {
        writer.enqueue('html');
      },
    });
    await expect(new Response(body).text()).rejects.toBe(failed);
  });
});
