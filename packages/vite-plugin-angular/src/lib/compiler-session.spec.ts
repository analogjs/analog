import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { createCompilerSession as makeSession } from './compiler-session.js';
import { nativeCompilerLayer } from './compiler-backend-live.js';

function createCompilerSession(
  compile: (files: string[] | undefined) => Promise<void>,
  close?: () => void | Promise<void>,
) {
  return makeSession(
    nativeCompilerLayer({ compile, ...(close ? { close } : {}) }),
  );
}

describe('compiler session', () => {
  it('opens a fresh scope when Vite reuses the plugin for another environment', async () => {
    const compile = vi.fn().mockResolvedValue(undefined);
    const release = Promise.withResolvers<void>();
    const dispose = vi.fn().mockReturnValueOnce(release.promise);
    const session = createCompilerSession(compile, dispose);
    await session.start();
    const closing = session.close();
    await expect(session.run()).rejects.toThrow('Compiler session is closed');
    const reopening = session.start();
    expect(session.ready()).toBe(reopening);
    expect(compile).toHaveBeenCalledTimes(1);
    release.resolve();
    await Promise.all([closing, reopening]);
    expect(compile).toHaveBeenCalledTimes(2);
    expect(dispose).toHaveBeenCalledTimes(1);
    await session.close();
    expect(dispose).toHaveBeenCalledTimes(2);
  });

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
      await expect(session.ready()).resolves.toEqual({ updatedComponents: [] });
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

  it('owns optimizer resources even when the compiler Layer never initializes', async () => {
    const compile = vi.fn();
    const close = vi.fn().mockResolvedValue(undefined);
    const session = createCompilerSession(compile);
    session.own(close);
    await session.close();
    await session.close();
    expect(compile).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('releases optimizer resources even when compiler disposal fails', async () => {
    const close = vi.fn().mockResolvedValue(undefined);
    const session = createCompilerSession(
      async () => {},
      async () => {
        throw new Error('compiler disposal failed');
      },
    );
    session.own(close);
    await session.start();
    await expect(session.close()).rejects.toThrow();
    expect(close).toHaveBeenCalledOnce();
  });

  it('registers a fresh watcher scope when the same plugin starts another server', async () => {
    const session = createCompilerSession(async () => {});
    const events = new EventEmitter();
    await session.start();
    await session.close();
    session.watch(events, 'change', () => {});
    await session.start();
    expect(events.listenerCount('change')).toBe(1);
    await session.close();
    expect(events.listenerCount('change')).toBe(0);
  });
});

describe('deferred server compilation', () => {
  it('coalesces idle edits and compiles once before concurrent reads', async () => {
    let revision = 0;
    const compile = vi.fn(async () => {
      revision++;
    });
    const session = createCompilerSession(compile);
    await session.start();
    session.defer(['view.html']);
    session.defer(['view.css', 'view.html']);
    expect(compile).toHaveBeenCalledTimes(1);
    expect(
      await Promise.all([
        session.read(() => revision),
        session.readAsync(async () => revision),
      ]),
    ).toEqual([2, 2]);
    expect(compile).toHaveBeenLastCalledWith(['view.html', 'view.css']);
    expect(compile).toHaveBeenCalledTimes(2);
    await session.close();
  });

  it('includes edits admitted while a read waits for compilation', async () => {
    const started = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    let revision = 0;
    const session = createCompilerSession(async () => {
      revision++;
      if (revision === 2) {
        started.resolve();
        await release.promise;
      }
    });
    await session.start();
    session.defer(['first.html']);
    const reading = session.read(() => revision);
    await started.promise;
    session.defer(['second.html']);
    release.resolve();
    expect(await reading).toBe(3);
    await session.close();
  });

  it('surfaces deferred failures and recovers on the next edit', async () => {
    const error = new Error('invalid resource');
    const compile = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(error)
      .mockResolvedValue(undefined);
    const session = createCompilerSession(compile);
    await session.start();
    session.defer(['broken.html']);
    await expect(session.read(() => 'stale')).rejects.toBe(error);
    session.defer(['fixed.html']);
    await expect(session.read(() => 'fresh')).resolves.toBe('fresh');
    await session.close();
  });

  it('discards unread dirty state on close and starts a fresh generation', async () => {
    const compile = vi.fn().mockResolvedValue(undefined);
    const session = createCompilerSession(compile);
    await session.start();
    session.defer(['unused.html']);
    await session.close();
    expect(compile).toHaveBeenCalledTimes(1);
    expect(() => session.defer(['late.html'])).toThrow('closed');
    await session.start();
    expect(compile).toHaveBeenLastCalledWith(undefined);
    await session.close();
  });
});
