import * as Context from 'effect/Context';
import * as Deferred from 'effect/Deferred';
import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';
import * as Fiber from 'effect/Fiber';
import * as Layer from 'effect/Layer';
import * as Metric from 'effect/Metric';
import * as Ref from 'effect/Ref';
import * as Semaphore from 'effect/Semaphore';
import {
  CompilerBackend,
  type CompilerFailure,
  type CompilationResult,
} from './compiler-backend.js';

type Completion = Deferred.Deferred<CompilationResult, CompilerFailure>;
interface Batch {
  readonly generation: number;
  readonly files: readonly string[] | undefined;
  readonly done: Completion;
}

type QueueState =
  | {
      readonly _tag: 'Idle';
      readonly generation: number;
      readonly result: Exit.Exit<CompilationResult, CompilerFailure>;
    }
  | {
      readonly _tag: 'Running';
      readonly generation: number;
      readonly active: Completion;
      readonly pending: Batch | undefined;
    };

const compilations = Metric.counter('analog.compiler.compilations');
const coalesced = Metric.counter('analog.compiler.coalesced');

export class CompilationScheduler extends Context.Service<
  CompilationScheduler,
  {
    readonly run: (
      files: readonly string[] | undefined,
    ) => Effect.Effect<CompilationResult, CompilerFailure>;
    readonly read: <A, E>(
      operation: Effect.Effect<A, E>,
    ) => Effect.Effect<A, E | CompilerFailure>;
  }
>()('@analogjs/vite-plugin-angular/CompilationScheduler') {
  static readonly layer: Layer.Layer<
    CompilationScheduler,
    never,
    CompilerBackend
  > = Layer.effect(
    CompilationScheduler,
    Effect.gen(function* () {
      const backend = yield* CompilerBackend;
      const scope = yield* Effect.scope;
      const permit = yield* Semaphore.make(1);
      const state = yield* Ref.make<QueueState>({
        _tag: 'Idle',
        generation: 0,
        result: Exit.succeed({ updatedComponents: [] }),
      });

      const drain = Effect.fn('analog.compiler.drain')(
        function* (first: Batch) {
          let batch = first;
          let waiters: Completion[] = [first.done];
          for (;;) {
            yield* Metric.update(compilations, 1);
            const result = yield* Effect.exit(backend.compile(batch));
            const next = yield* Ref.modify(
              state,
              (current): readonly [Batch | undefined, QueueState] => {
                const pending =
                  current._tag === 'Running' ? current.pending : undefined;
                return pending
                  ? [
                      pending,
                      {
                        _tag: 'Running',
                        generation: current.generation,
                        active: pending.done,
                        pending: undefined,
                      },
                    ]
                  : [
                      undefined,
                      { _tag: 'Idle', generation: current.generation, result },
                    ];
              },
            );
            // One completion per batch, rather than copying every queued waiter.
            if (next && Exit.isSuccess(result)) {
              waiters.push(next.done);
              batch = next;
              continue;
            }
            for (const waiter of waiters) yield* Deferred.done(waiter, result);
            if (!next) return;
            batch = next;
            waiters = [next.done];
          }
        },
        permit.withPermits(1),
        Effect.uninterruptible,
      );

      const run = Effect.fn('analog.compiler.run')(
        (files: readonly string[] | undefined) =>
          Effect.uninterruptibleMask((restore) =>
            Effect.gen(function* () {
              const done = yield* Deferred.make<
                CompilationResult,
                CompilerFailure
              >();
              const [batch, start] = yield* Ref.modify(
                state,
                (current): readonly [readonly [Batch, boolean], QueueState] => {
                  const generation = current.generation + 1;
                  const pending =
                    current._tag === 'Running' ? current.pending : undefined;
                  const batch: Batch = {
                    generation,
                    done: pending?.done ?? done,
                    files: pending
                      ? mergeInvalidations(pending.files, files)
                      : files?.slice(),
                  };
                  return current._tag === 'Idle'
                    ? [
                        [batch, true],
                        {
                          _tag: 'Running',
                          generation,
                          active: batch.done,
                          pending: undefined,
                        },
                      ]
                    : [
                        [batch, false],
                        { ...current, generation, pending: batch },
                      ];
                },
              );
              if (start) yield* Effect.forkIn(drain(batch), scope);
              else yield* Metric.update(coalesced, 1);
              return yield* restore(Deferred.await(batch.done));
            }),
          ),
      );

      // Lazy TypeScript emission reads mutable compiler internals. It shares the
      // compilation permit and rechecks readiness after acquiring it.
      const read = <A, E>(
        operation: Effect.Effect<A, E>,
      ): Effect.Effect<A, E | CompilerFailure> =>
        Effect.gen(function* () {
          for (;;) {
            const result = yield* Effect.gen(function* () {
              const current = yield* Ref.get(state);
              if (current._tag === 'Running')
                return {
                  _tag: 'Wait' as const,
                  done: current.pending?.done ?? current.active,
                };
              if (Exit.isFailure(current.result))
                return yield* Effect.failCause(current.result.cause);
              return { _tag: 'Read' as const, value: yield* operation };
            }).pipe(permit.withPermits(1));
            if (result._tag === 'Read') return result.value;
            yield* Deferred.await(result.done);
          }
        }).pipe(
          Effect.withSpan('analog.compiler.read'),
          Effect.uninterruptible,
          Effect.forkIn(scope),
          Effect.flatMap(Fiber.join),
        );
      return CompilationScheduler.of({ run, read });
    }),
  );
}

function mergeInvalidations(
  previous: readonly string[] | undefined,
  next: readonly string[] | undefined,
): readonly string[] | undefined {
  return previous && next ? [...new Set([...previous, ...next])] : undefined;
}
