import * as Scope from 'effect/Scope';
import * as Exit from 'effect/Exit';
import * as Effect from 'effect/Effect';
import * as ManagedRuntime from 'effect/ManagedRuntime';
import * as TestClock from 'effect/testing/TestClock';
import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCompilerSession as makeSession } from './compiler-session.js';
import { nativeCompilerLayer } from './compiler-backend-live.js';

vi.mock('effect/ManagedRuntime', { spy: true });

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
  it('holds concurrent SSR reads through a later source generation', async () => {
    const first = Promise.withResolvers<void>();
    const second = Promise.withResolvers<void>();
    const compile = vi.fn().mockResolvedValue(undefined);
    const reader = vi.fn(() => 'fresh');
    const session = createCompilerSession(compile);
    await session.start();
    session.defer(['view.css'], () => first.promise);
    const read = session.read(reader);
    const concurrent = session.readAsync(async () => reader());
    const ready = session.ready();
    session.defer(['view.html'], () => second.promise);
    first.resolve();
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(compile).toHaveBeenCalledTimes(2);
    expect(reader).not.toHaveBeenCalled();
    setTimeout(() => second.resolve(), 30);
    await expect(Promise.all([read, concurrent, ready])).resolves.toEqual([
      'fresh',
      'fresh',
      { updatedComponents: [] },
    ]);
    expect(compile).toHaveBeenCalledTimes(3);
    expect(reader).toHaveBeenCalledTimes(2);
    expect(compile).toHaveBeenLastCalledWith(['view.html']);
    await session.close();
  });

  it('cancels an unsettled source barrier on close without admitting native work', async () => {
    const compile = vi.fn().mockResolvedValue(undefined);
    const session = createCompilerSession(compile);
    await session.start();
    session.defer(
      ['view.css'],
      (signal) =>
        new Promise<void>((_resolve, reject) =>
          signal.addEventListener('abort', () => reject(signal.reason), {
            once: true,
          }),
        ),
    );
    const read = session.read(() => 'fresh');
    await session.close();
    await expect(read).rejects.toBeDefined();
    expect(compile).toHaveBeenCalledTimes(1);
  });

  it('does not admit native work after close when a source read ignores abort', async () => {
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const compile = vi.fn().mockResolvedValue(undefined);
    const session = createCompilerSession(compile);
    await session.start();
    session.defer(['view.css'], async () => {
      entered.resolve();
      await release.promise;
    });
    const read = session.read(() => 'fresh');
    await entered.promise;
    const closing = session.close();
    expect(compile).toHaveBeenCalledTimes(1);
    release.resolve();
    await closing;
    await expect(read).rejects.toBeDefined();
    expect(compile).toHaveBeenCalledTimes(1);
  });

  it('surfaces a source gate failure and recovers with a later edit', async () => {
    const failure = new Error('source read failed');
    const compile = vi.fn().mockResolvedValue(undefined);
    const session = createCompilerSession(compile);
    await session.start();
    session.defer(['broken.css'], async () => {
      throw failure;
    });
    await expect(session.read(() => 'stale')).rejects.toBe(failure);
    session.defer(['fixed.css'], async () => {});
    await expect(session.read(() => 'fresh')).resolves.toBe('fresh');
    expect(compile).toHaveBeenCalledTimes(2);
    await session.close();
  });

  it('does not inherit a cancelled source gate after restart', async () => {
    const entered = Promise.withResolvers<void>();
    const compile = vi.fn().mockResolvedValue(undefined);
    const session = createCompilerSession(compile);
    await session.start();
    session.defer(
      ['old.css'],
      (signal) =>
        new Promise<void>((_resolve, reject) => {
          entered.resolve();
          signal.addEventListener('abort', () => reject(signal.reason), {
            once: true,
          });
        }),
    );
    const read = session.read(() => 'stale');
    await entered.promise;
    await session.close();
    await expect(read).rejects.toBeDefined();
    await session.start();
    expect(compile).toHaveBeenCalledTimes(2);
    await session.close();
  });

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

describe('scoped SSR warmup', () => {
  const scopes: Scope.Closeable[] = [];
  afterEach(async () => {
    for (const scope of scopes.splice(0))
      await Effect.runPromise(Scope.close(scope, Exit.void));
    vi.restoreAllMocks();
  });
  async function setup(
    compile = vi.fn().mockResolvedValue(undefined),
    close = vi.fn(),
  ) {
    const scope = Scope.makeUnsafe();
    scopes.push(scope);
    const clock = await Effect.runPromise(
      Effect.provideService(TestClock.make(), Scope.Scope, scope),
    );
    const session = makeSession(nativeCompilerLayer({ compile, close }), clock);
    const advance = (ms: number) => Effect.runPromise(clock.adjust(ms));
    return { session, clock, compile, close, advance };
  }

  it('allocates one runtime at concurrent first use and none for unused ownership', async () => {
    const make = vi.mocked(ManagedRuntime.make);
    make.mockClear();
    const { session, compile } = await setup();
    const resource = vi.fn().mockResolvedValue(undefined);
    const events = new EventEmitter();
    session.own(resource);
    session.watch(events, 'change', () => {});
    expect(make).not.toHaveBeenCalled();
    await session.close();
    expect(resource).toHaveBeenCalledOnce();
    expect(events.listenerCount('change')).toBe(0);
    expect(make).not.toHaveBeenCalled();
    await Promise.all([session.start(), session.read(() => 'ready')]);
    expect(make).toHaveBeenCalledTimes(1);
    expect(compile).toHaveBeenCalledOnce();
    await session.close();
    await session.start();
    expect(make).toHaveBeenCalledTimes(2);
    await session.close();
    make.mockRestore();
  });

  it('replaces the quiet delay and coalesces pending edits', async () => {
    const { session, compile, advance } = await setup();
    await session.start();
    session.defer(['one.html']);
    session.warmup();
    await advance(74);
    expect(compile).toHaveBeenCalledTimes(1);
    session.defer(['two.css']);
    session.warmup();
    await advance(74);
    expect(compile).toHaveBeenCalledTimes(1);
    await advance(1);
    await session.ready();
    expect(compile).toHaveBeenCalledTimes(2);
    expect(compile).toHaveBeenLastCalledWith(['one.html', 'two.css']);
    await session.close();
  });

  it('lets reads bypass the delay without a later duplicate compilation', async () => {
    const { session, compile, advance } = await setup();
    await session.start();
    session.defer(['one.html']);
    session.warmup();
    await session.read(() => 'fresh');
    expect(compile).toHaveBeenCalledTimes(2);
    await advance(100);
    expect(compile).toHaveBeenCalledTimes(2);
    await session.close();
  });

  it('retains failures for readiness and reads, then recovers on a later edit', async () => {
    const failure = new Error('warmup failed');
    const compile = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(failure)
      .mockResolvedValue(undefined);
    const { session, advance } = await setup(compile);
    await session.start();
    session.defer(['broken.html']);
    session.warmup();
    await advance(75);
    await expect(session.ready()).rejects.toBe(failure);
    await expect(session.read(() => 'stale')).rejects.toBe(failure);
    session.defer(['fixed.html']);
    session.warmup();
    await advance(75);
    await expect(session.read(() => 'fresh')).resolves.toBe('fresh');
    await session.close();
  });

  it('cancels unadmitted work and never inherits a prior delay after reopen', async () => {
    const { session, compile, advance } = await setup();
    await session.start();
    session.defer(['old.html']);
    session.warmup();
    await session.close();
    await session.start();
    await advance(100);
    expect(compile.mock.calls).toEqual([[undefined], [undefined]]);
    await session.close();
  });

  it('drains admitted native warmup and includes edits arriving during a read', async () => {
    const started = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    let revision = 0;
    const compile = vi.fn(async () => {
      if (++revision === 2) {
        started.resolve();
        await release.promise;
      }
    });
    const { session, advance, close } = await setup(compile);
    await session.start();
    session.defer(['one.html']);
    session.warmup();
    await advance(75);
    await started.promise;
    const read = session.read(() => revision);
    session.defer(['two.html']);
    const closing = session.close();
    expect(close).not.toHaveBeenCalled();
    release.resolve();
    expect(await read).toBe(3);
    await closing;
    expect(close).toHaveBeenCalledOnce();
  });
});
