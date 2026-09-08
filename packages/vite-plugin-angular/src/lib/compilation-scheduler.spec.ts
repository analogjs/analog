import { it, expect } from '@effect/vitest';
import * as Cause from 'effect/Cause';
import * as Deferred from 'effect/Deferred';
import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';
import * as Fiber from 'effect/Fiber';
import * as Layer from 'effect/Layer';
import { expectTypeOf } from 'vitest';
import {
  CompilerBackend,
  CompilationFailure,
  type CompilationResult,
  type CompilerFailure,
} from './compiler-backend.js';
import { CompilationScheduler } from './compilation-scheduler.js';

it.effect(
  'returns the newest generation to every waiter when compilation is superseded',
  () =>
    Effect.gen(function* () {
      const started = yield* Deferred.make<void>();
      const release = yield* Deferred.make<void>();
      const backend = Layer.succeed(CompilerBackend, {
        compile: Effect.fn(function* (request) {
          if (request.generation === 1) {
            yield* Deferred.succeed(started, undefined);
            yield* Deferred.await(release);
          }
          return { updatedComponents: [`generation-${request.generation}`] };
        }),
      });
      yield* Effect.gen(function* () {
        const scheduler = yield* CompilationScheduler;
        const first = yield* Effect.forkScoped(scheduler.run(['first.ts']));
        yield* Deferred.await(started);
        const next = yield* Effect.forkScoped(scheduler.run(['next.ts']));
        yield* Effect.yieldNow;
        yield* Deferred.succeed(release, undefined);
        expect(yield* Fiber.join(first)).toEqual({
          updatedComponents: ['generation-2'],
        });
        expect(yield* Fiber.join(next)).toEqual({
          updatedComponents: ['generation-2'],
        });
      }).pipe(
        Effect.provide(CompilationScheduler.layer.pipe(Layer.provide(backend))),
      );
    }),
);

it.effect('keeps expected failures, defects, and interruption distinct', () =>
  Effect.gen(function* () {
    for (const [kind, compile] of [
      [
        'failure',
        Effect.fail(new CompilationFailure({ cause: new Error('template') })),
      ],
      ['defect', Effect.die(new Error('invariant'))],
      ['interrupt', Effect.interrupt],
    ] as const) {
      const result = yield* Effect.exit(
        Effect.flatMap(CompilationScheduler, (scheduler) =>
          scheduler.run(undefined),
        ).pipe(
          Effect.provide(
            CompilationScheduler.layer.pipe(
              Layer.provide(
                Layer.succeed(CompilerBackend, { compile: () => compile }),
              ),
            ),
          ),
        ),
      );
      expect(Exit.isFailure(result)).toBe(true);
      if (Exit.isFailure(result)) {
        expect(Cause.hasFails(result.cause)).toBe(kind === 'failure');
        expect(Cause.hasDies(result.cause)).toBe(kind === 'defect');
        expect(Cause.hasInterrupts(result.cause)).toBe(kind === 'interrupt');
      }
    }
  }),
);

it.effect(
  'closes partially acquired backends exactly once when initialization fails',
  () =>
    Effect.gen(function* () {
      let releases = 0;
      const failure = new Error('initialization failed');
      const backend = Layer.effect(
        CompilerBackend,
        Effect.gen(function* () {
          yield* Effect.acquireRelease(Effect.void, () =>
            Effect.sync(() => {
              releases++;
            }),
          );
          return yield* Effect.die(failure);
        }),
      );
      const result = yield* Effect.exit(
        Effect.scoped(
          Effect.flatMap(CompilationScheduler, (scheduler) =>
            scheduler.run(undefined),
          ).pipe(
            Effect.provide(
              CompilationScheduler.layer.pipe(Layer.provide(backend)),
            ),
          ),
        ),
      );
      expect(Exit.isFailure(result)).toBe(true);
      expect(releases).toBe(1);
    }),
);

it('requires a backend Layer before a compilation program can run', () => {
  const program = Effect.flatMap(CompilerBackend, (backend) =>
    backend.compile({ generation: 1, files: undefined }),
  );
  expectTypeOf<
    Effect.Services<typeof program>
  >().toEqualTypeOf<CompilerBackend>();
  expectTypeOf<Effect.Error<typeof program>>().toEqualTypeOf<CompilerFailure>();
  expectTypeOf<
    Effect.Success<typeof program>
  >().toEqualTypeOf<CompilationResult>();
});
