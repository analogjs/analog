import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { createCompilerSession } from './compiler-session.js';

describe('compiler session', () => {
  it.each([false, true])(
    'coalesces pending invalidations (full=%s)',
    async (full) => {
      const started = Promise.withResolvers<void>();
      const release = Promise.withResolvers<void>();
      const calls: (string[] | undefined)[] = [];
      const session = createCompilerSession(async (ids) => {
        calls.push(ids);
        if (calls.length === 1) {
          started.resolve();
          await release.promise;
        }
      });
      try {
        const first = session.run(['first.ts']);
        await started.promise;
        const pending = Array.from({ length: 100 }, (_, i) =>
          session.run([`${i % 2}.ts`]),
        );
        if (full) pending.push(session.run());
        const ready = session.ready();
        release.resolve();
        await Promise.all([first, ready, ...pending]);
        expect(calls).toEqual([
          ['first.ts'],
          full ? undefined : ['0.ts', '1.ts'],
        ]);
      } finally {
        release.resolve();
        await session.close();
      }
    },
  );

  it('preserves the original failure and permits recovery', async () => {
    const error = new Error('invalid template');
    const compile = vi
      .fn()
      .mockRejectedValueOnce(error)
      .mockResolvedValue(undefined);
    const session = createCompilerSession(compile);
    try {
      await expect(session.run()).rejects.toBe(error);
      await expect(session.ready()).rejects.toBe(error);
      await session.run(['fixed.ts']);
      await expect(session.ready()).resolves.toBeUndefined();
      expect(compile).toHaveBeenCalledTimes(2);
    } finally {
      await session.close();
    }
  });

  it('keeps ownership when a waiter aborts and drains before disposal', async () => {
    const started = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const dispose = vi.fn();
    const events = new EventEmitter();
    const external = vi.fn();
    const owned = vi.fn();
    events.on('change', external);
    const session = createCompilerSession(async () => {
      started.resolve();
      await release.promise;
    }, dispose);
    session.watch(events, 'change', owned);
    const controller = new AbortController();
    const first = session.run(undefined, controller.signal);
    await started.promise;
    const aborted = expect(first).rejects.toThrow();
    controller.abort();
    await aborted;
    const next = session.run(['next.ts']);
    const closing = session.close();
    expect(session.close()).toBe(closing);
    expect(dispose).not.toHaveBeenCalled();
    expect(events.listeners('change')).toEqual([external]);
    release.resolve();
    await next;
    await closing;
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('isolates sessions and records readiness before initialization', async () => {
    const release = Promise.withResolvers<void>();
    const first = createCompilerSession(() => release.promise);
    const second = createCompilerSession(async () => {});
    const work = first.run();
    const ready = first.ready();
    expect(ready).toBe(work);
    try {
      await second.run();
      release.resolve();
      await ready;
    } finally {
      release.resolve();
      await Promise.all([first.close(), second.close()]);
    }
  });

  it('removes listeners even when no compilation initialized the layer', async () => {
    const events = new EventEmitter();
    const compile = vi.fn();
    const session = createCompilerSession(compile);
    session.watch(events, 'add', () => {});
    await session.close();
    expect(events.listenerCount('add')).toBe(0);
    expect(compile).not.toHaveBeenCalled();
  });
});
