import {
  Context,
  Data,
  Deferred,
  Effect,
  Layer,
  ManagedRuntime,
  Ref,
  Semaphore,
} from 'effect';
import type { EventEmitter } from 'node:events';

class CompilationFailure extends Data.TaggedError('CompilationFailure')<{
  cause: unknown;
}> {}

class Compilation extends Context.Service<
  Compilation,
  {
    run: (ids?: string[]) => Effect.Effect<void, CompilationFailure>;
  }
>()('@analogjs/vite-plugin-angular/Compilation') {}

interface Batch {
  ids: string[] | undefined;
  done: Deferred.Deferred<void, CompilationFailure>;
}

export interface CompilerSession {
  start(): Promise<void>;
  run(ids?: string[], signal?: AbortSignal): Promise<void>;
  ready(): Promise<void>;
  close(): Promise<void>;
  watch(
    watcher: Pick<EventEmitter, 'on' | 'off'>,
    event: string,
    listener: (file: string) => void,
  ): void;
}

function compilationLayer(
  compile: (ids?: string[]) => Promise<void>,
  dispose?: () => void | Promise<void>,
): Layer.Layer<Compilation> {
  const resource = Effect.gen(function* () {
    const scope = yield* Effect.scope;
    const semaphore = yield* Semaphore.make(1);
    const pending = yield* Ref.make<Batch | undefined>(undefined);
    yield* Effect.addFinalizer(() =>
      Effect.promise(async () => {
        await dispose?.();
      }),
    );
    const drain = Effect.gen(function* () {
      const batch = yield* Ref.getAndSet(pending, undefined);
      if (!batch) return;
      yield* Deferred.complete(
        batch.done,
        Effect.tryPromise({
          try: () => compile(batch.ids),
          catch: (cause) => new CompilationFailure({ cause }),
        }),
      );
    }).pipe(semaphore.withPermits(1), Effect.uninterruptible);

    const run = Effect.fn('analog.compile')(function* (ids?: string[]) {
      const done = yield* Deferred.make<void, CompilationFailure>();
      const [batch, start] = yield* Ref.modify(pending, (previous) => {
        const next: Batch = {
          done: previous?.done ?? done,
          ids: previous ? mergeInvalidations(previous.ids, ids) : ids?.slice(),
        };
        return [[next, !previous] as const, next];
      });
      if (start) yield* Effect.forkIn(drain, scope);
      return yield* Deferred.await(batch.done);
    });
    return Compilation.of({ run });
  });
  return Layer.effect(Compilation, resource);
}

function mergeInvalidations(
  previous: string[] | undefined,
  next: string[] | undefined,
): string[] | undefined {
  return previous && next ? [...new Set([...previous, ...next])] : undefined;
}

/** One owner for pending compiler mutations, including non-abortable work. */
export function createCompilerSession(
  compile: (ids?: string[]) => Promise<void>,
  dispose?: () => void | Promise<void>,
): CompilerSession {
  let runtime = ManagedRuntime.make(compilationLayer(compile, dispose));
  // Record the Promise synchronously so a Vite transform arriving while the
  // Layer is initializing can already wait for the scheduled compilation.
  let pending = Promise.resolve();
  const listeners: (() => void)[] = [];
  let closing: Promise<void> | undefined;
  const session: CompilerSession = {
    start() {
      const previous = closing;
      if (previous) {
        const layer = Effect.as(
          Effect.promise(() => previous),
          compilationLayer(compile, dispose),
        );
        runtime = ManagedRuntime.make(Layer.unwrap(layer));
        closing = undefined;
      }
      return session.run();
    },
    run(ids, signal) {
      if (closing)
        return Promise.reject(new Error('Compiler session is closed'));
      const work = runtime.runPromise(
        Effect.flatMap(Compilation, (session) => session.run(ids)),
      );
      pending = work.catch((error: unknown) => {
        throw error instanceof CompilationFailure ? error.cause : error;
      });
      void pending.catch(() => {});
      if (!signal) return pending;
      const result = pending;
      return Effect.runPromise(
        Effect.promise(() => result),
        { signal },
      );
    },
    ready: () => pending,
    close() {
      for (const remove of listeners.splice(0)) remove();
      const current = runtime;
      const work = pending;
      closing ??= (async () => {
        await work.catch(() => {});
        await current.dispose();
      })();
      return closing;
    },
    watch(watcher, event, listener) {
      watcher.on(event, listener);
      listeners.push(() => {
        watcher.off(event, listener);
      });
    },
  };
  return session;
}
