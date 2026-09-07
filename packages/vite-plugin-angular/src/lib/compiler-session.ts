import { Effect, Exit, Layer, ManagedRuntime, Scope } from 'effect';
import type { EventEmitter } from 'node:events';
import {
  CompilationFailure,
  type CompilationResult,
  type CompilerBackend,
} from './compiler-backend.js';
import { CompilationScheduler } from './compilation-scheduler.js';
import { NativeOperations } from './native-operations.js';

export interface CompilerSession {
  start(): Promise<CompilationResult>;
  run(
    ids?: readonly string[],
    signal?: AbortSignal,
  ): Promise<CompilationResult>;
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
  readonly runtime: ManagedRuntime.ManagedRuntime<CompilationScheduler, never>;
  readonly listeners: (() => void)[];
  readonly resources: Scope.Closeable;
  readonly operations: NativeOperations;
  ready: Promise<CompilationResult | undefined>;
}

type Lifecycle =
  | ActiveSession
  | { readonly _tag: 'Closing'; readonly closed: Promise<void> };

/** The native Vite boundary: one lifecycle and one runtime per owner. */
export function createCompilerSession(
  backend: Layer.Layer<CompilerBackend>,
): CompilerSession {
  const layer = CompilationScheduler.layer.pipe(Layer.provide(backend));
  const open = (previous?: Promise<void>): ActiveSession => ({
    _tag: 'Active',
    runtime: ManagedRuntime.make(
      previous
        ? Layer.unwrap(
            Effect.as(
              Effect.promise(() => previous),
              layer,
            ),
          )
        : layer,
    ),
    listeners: [],
    resources: Scope.makeUnsafe(),
    operations: new NativeOperations(),
    ready: Promise.resolve(undefined),
  });
  let state: Lifecycle = open();
  const session: CompilerSession = {
    start() {
      if (state._tag === 'Closing') state = open(state.closed);
      return session.run();
    },
    run(ids, signal) {
      if (state._tag === 'Closing')
        return Promise.reject(new Error('Compiler session is closed'));
      const work = state.runtime
        .runPromise(
          Effect.flatMap(CompilationScheduler, (scheduler) =>
            scheduler.run(ids),
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
    ready: () =>
      state._tag === 'Active'
        ? state.ready
        : state.closed.then(() => undefined),
    close() {
      if (state._tag === 'Closing') return state.closed;
      const active = state;
      for (const remove of active.listeners.splice(0)) remove();
      const closed = Effect.runPromise(
        Effect.promise(() => active.operations.drain()).pipe(
          Effect.andThen(active.runtime.disposeEffect),
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
      if (state._tag === 'Closing')
        return Promise.reject(new Error('Compiler session is closed'));
      return state.operations.track(
        state.runtime
          .runPromise(
            Effect.flatMap(CompilationScheduler, (scheduler) =>
              scheduler.read(
                Effect.try({
                  try: reader,
                  catch: (cause) => new CompilationFailure({ cause }),
                }),
              ),
            ),
          )
          .catch((error: unknown) => {
            throw error instanceof CompilationFailure ? error.cause : error;
          }),
      );
    },
    readAsync(reader) {
      if (state._tag === 'Closing')
        return Promise.reject(new Error('Compiler session is closed'));
      return state.operations.track(
        state.runtime
          .runPromise(
            Effect.flatMap(CompilationScheduler, (scheduler) =>
              scheduler.read(
                Effect.tryPromise({
                  try: reader,
                  catch: (cause) => new CompilationFailure({ cause }),
                }),
              ),
            ),
          )
          .catch((error: unknown) => {
            throw error instanceof CompilationFailure ? error.cause : error;
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
  return session;
}
