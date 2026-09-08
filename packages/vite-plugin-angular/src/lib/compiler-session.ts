import * as Clock from 'effect/Clock';
import * as Fiber from 'effect/Fiber';
import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';
import * as Layer from 'effect/Layer';
import * as ManagedRuntime from 'effect/ManagedRuntime';
import * as Scope from 'effect/Scope';
import type { EventEmitter } from 'node:events';
import {
  CompilationFailure,
  type CompilationResult,
  type CompilerBackend,
} from './compiler-backend.js';
import { CompilationScheduler } from './compilation-scheduler.js';
import { NativeOperations } from './native-operations.js';

/** A source-specific barrier used only when a watcher saw an unstable write. */
export type BeforeCompile = (signal: AbortSignal) => Promise<void>;

export interface CompilerSession {
  start(): Promise<CompilationResult>;
  run(
    ids?: readonly string[],
    signal?: AbortSignal,
  ): Promise<CompilationResult>;
  defer(ids: readonly string[], beforeCompile?: BeforeCompile): void;
  warmup(): void;
  ready(): Promise<CompilationResult | undefined>;
  close(): Promise<void>;
  own(finalizer: () => Promise<void>): void;
  read<A>(reader: () => A): Promise<A>;
  readAsync<A>(reader: () => Promise<A>): Promise<A>;
  watch(
    watcher: Pick<EventEmitter, 'on' | 'off'>,
    event: string,
    listener: (file: string) => void,
  ): void;
}

interface ActiveSession {
  readonly _tag: 'Active';
  runtime:
    | ManagedRuntime.ManagedRuntime<CompilationScheduler, never>
    | undefined;
  readonly previous: Promise<void> | undefined;
  warmup: Fiber.Fiber<void> | undefined;
  readonly listeners: (() => void)[];
  readonly resources: Scope.Closeable;
  readonly operations: NativeOperations;
  ready: Promise<CompilationResult | undefined>;
  readonly dirty: Map<string, BeforeCompile | undefined>;
  readonly settlementAbort: AbortController;
  readers: number;
}

type Lifecycle =
  | ActiveSession
  | { readonly _tag: 'Closing'; readonly closed: Promise<void> };

/** The native Vite boundary: one lifecycle and one runtime per owner. */
export function createCompilerSession(
  backend: Layer.Layer<CompilerBackend>,
  clock?: Clock.Clock,
): CompilerSession {
  const layer = CompilationScheduler.layer.pipe(Layer.provide(backend));
  const open = (previous?: Promise<void>): ActiveSession => ({
    _tag: 'Active',
    runtime: undefined,
    previous,
    warmup: undefined,
    listeners: [],
    resources: Scope.makeUnsafe(),
    operations: new NativeOperations(),
    ready: Promise.resolve(undefined),
    dirty: new Map(),
    settlementAbort: new AbortController(),
    readers: 0,
  });
  const runtime = (active: ActiveSession) =>
    (active.runtime ??= ManagedRuntime.make(
      active.previous
        ? Layer.unwrap(
            Effect.as(
              Effect.promise(() => active.previous!),
              layer,
            ),
          )
        : layer,
    ));
  function cancelWarmup(active: ActiveSession) {
    const waiting = active.warmup;
    active.warmup = undefined;
    if (waiting) Effect.runSync(Fiber.interrupt(waiting));
  }
  let state: Lifecycle = open();
  const session: CompilerSession = {
    start() {
      if (state._tag === 'Closing') state = open(state.closed);
      return session.run();
    },
    run(ids, signal) {
      if (state._tag === 'Closing')
        return Promise.reject(new Error('Compiler session is closed'));
      const active = state;
      cancelWarmup(active);
      const dirty = [...active.dirty];
      ids = ids
        ? [...new Set([...dirty.map(([id]) => id), ...ids])]
        : undefined;
      active.dirty.clear();
      const beforeCompile = composeBeforeCompile(
        dirty.map(([, barrier]) => barrier),
        active.settlementAbort.signal,
      );
      const work = runtime(active)
        .runPromise(
          Effect.flatMap(CompilationScheduler, (scheduler) =>
            scheduler.run(ids, beforeCompile),
          ),
        )
        .catch((error: unknown) => {
          throw error instanceof CompilationFailure ? error.cause : error;
        });
      // Publish readiness before the asynchronous Layer can initialize.
      state.ready = work;
      state.operations.track(work);
      return signal
        ? Effect.runPromise(
            Effect.promise(() => work),
            { signal },
          )
        : work;
    },
    defer(ids, beforeCompile) {
      if (state._tag === 'Closing')
        throw new Error('Compiler session is closed');
      cancelWarmup(state);
      for (const id of ids)
        state.dirty.set(id, beforeCompile ?? state.dirty.get(id));
      if (state.readers && state.dirty.size)
        session.run([...state.dirty.keys()]);
    },
    warmup() {
      if (state._tag === 'Closing' || !state.dirty.size) return;
      const active = state;
      cancelWarmup(active);
      const delayed = Effect.sleep(75).pipe(
        Effect.andThen(
          Effect.sync(() => {
            active.warmup = undefined;
            if (state === active && active.dirty.size)
              session.run([...active.dirty.keys()]);
          }),
        ),
      );
      // ManagedRuntime.runFork attaches this waiting fiber to its owning scope.
      active.warmup = runtime(active).runFork(
        clock ? Effect.provideService(delayed, Clock.Clock, clock) : delayed,
      );
    },
    ready() {
      if (state._tag === 'Closing') return state.closed.then(() => undefined);
      if (state.dirty.size) return session.run([...state.dirty.keys()]);
      return state.ready;
    },
    close() {
      if (state._tag === 'Closing') return state.closed;
      const active = state;
      cancelWarmup(active);
      active.settlementAbort.abort();
      for (const remove of active.listeners.splice(0)) remove();
      const closed = Effect.runPromise(
        Effect.promise(() => active.operations.drain()).pipe(
          Effect.andThen(
            Effect.suspend(() => active.runtime?.disposeEffect ?? Effect.void),
          ),
          Effect.ensuring(
            Scope.close(active.resources, Exit.succeed(undefined)),
          ),
        ),
      );
      state = { _tag: 'Closing', closed };
      return closed;
    },
    own(finalizer) {
      if (state._tag === 'Closing') state = open(state.closed);
      Effect.runSync(
        Scope.addFinalizer(state.resources, Effect.promise(finalizer)),
      );
    },
    read(reader) {
      return read(
        Effect.try({
          try: reader,
          catch: (cause) => new CompilationFailure({ cause }),
        }),
      );
    },
    readAsync(reader) {
      return read(
        Effect.tryPromise({
          try: reader,
          catch: (cause) => new CompilationFailure({ cause }),
        }),
      );
    },
    watch(watcher, event, listener) {
      if (state._tag === 'Closing') state = open(state.closed);
      watcher.on(event, listener);
      state.listeners.push(() => {
        watcher.off(event, listener);
      });
    },
  };
  function read<A>(
    operation: Effect.Effect<A, CompilationFailure>,
  ): Promise<A> {
    if (state._tag === 'Closing')
      return Promise.reject(new Error('Compiler session is closed'));
    const active = state;
    active.readers++;
    if (active.dirty.size) session.run([...active.dirty.keys()]);
    return active.operations.track(
      runtime(active)
        .runPromise(
          Effect.flatMap(CompilationScheduler, (scheduler) =>
            scheduler.read(operation),
          ),
        )
        .catch((error: unknown) => {
          throw error instanceof CompilationFailure ? error.cause : error;
        })
        .finally(() => {
          active.readers--;
        }),
    );
  }
  return session;
}

function composeBeforeCompile(
  barriers: readonly (BeforeCompile | undefined)[],
  signal: AbortSignal,
): (() => Promise<void>) | undefined {
  const active = barriers.filter(
    (barrier): barrier is BeforeCompile => barrier !== undefined,
  );
  return active.length
    ? () => {
        if (signal.aborted) return Promise.reject(signal.reason);
        return Promise.all(active.map((barrier) => barrier(signal))).then(() =>
          signal.throwIfAborted(),
        );
      }
    : undefined;
}
