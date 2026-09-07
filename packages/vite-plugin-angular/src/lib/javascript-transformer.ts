import * as Context from 'effect/Context';
import * as Data from 'effect/Data';
import * as Effect from 'effect/Effect';
import * as Fiber from 'effect/Fiber';
import * as Layer from 'effect/Layer';
import * as ManagedRuntime from 'effect/ManagedRuntime';
import * as Schema from 'effect/Schema';
import * as Semaphore from 'effect/Semaphore';
import { JavaScriptTransformer } from './utils/devkit.js';
import { NativeOperations } from './native-operations.js';
import {
  TransformCache,
  TransformCacheKey,
  transformCacheLayer,
  type TransformCacheStore,
} from './utils/transform-cache.js';

export interface JavaScriptTransformOptions {
  readonly sourcemap: boolean;
  readonly jit?: boolean;
  readonly advancedOptimizations?: boolean;
  readonly thirdPartySourcemaps?: boolean;
}

export class JavaScriptTransformFailure extends Data.TaggedError(
  'JavaScriptTransformFailure',
)<{
  readonly file: string;
  readonly cause: unknown;
}> {}

export class JavaScriptTransformerFailure extends Data.TaggedError(
  'JavaScriptTransformerFailure',
)<{
  readonly phase: 'acquire' | 'release';
  readonly cause: unknown;
}> {}

export class DependencyTransformer extends Context.Service<
  DependencyTransformer,
  {
    readonly transformFile: (
      file: string,
    ) => Effect.Effect<Uint8Array, JavaScriptTransformFailure>;
    readonly transformData: (
      file: string,
      code: string,
      sideEffects: boolean,
    ) => Effect.Effect<Uint8Array, JavaScriptTransformFailure>;
  }
>()('@analogjs/vite-plugin-angular/DependencyTransformer') {}

export function dependencyTransformerLayer(
  options: JavaScriptTransformOptions,
): Layer.Layer<
  DependencyTransformer,
  JavaScriptTransformerFailure,
  TransformCache
> {
  return Layer.effect(
    DependencyTransformer,
    Effect.gen(function* () {
      const scope = yield* Effect.scope;
      const semaphore = yield* Semaphore.make(1);
      const store = yield* TransformCache;
      // Angular invokes these callbacks from its non-abortable native operation.
      // The owning transform fiber drains every callback before releasing workers.
      const key = Schema.decodeUnknownSync(TransformCacheKey);
      const cache: TransformCacheStore = {
        get: (value) => Effect.runPromise(store.get(key(value))),
        put: (value, contents) =>
          Effect.runPromise(store.put(key(value), contents)),
      };
      const transformer = yield* Effect.acquireRelease(
        Effect.try({
          try: () => new JavaScriptTransformer(options, 1, cache),
          catch: (cause) =>
            new JavaScriptTransformerFailure({ phase: 'acquire', cause }),
        }),
        (value) =>
          Effect.tryPromise({
            try: () => value.close(),
            catch: (cause) =>
              new JavaScriptTransformerFailure({ phase: 'release', cause }),
          }).pipe(Effect.orDie),
      );
      const transform = Effect.fn('analog.dependencies.transform')(function* (
        file: string,
        work: () => Promise<Uint8Array>,
      ) {
        return yield* Effect.tryPromise({
          try: work,
          catch: (cause) => new JavaScriptTransformFailure({ file, cause }),
        }).pipe(
          semaphore.withPermits(1),
          Effect.uninterruptible,
          Effect.forkIn(scope),
          Effect.flatMap(Fiber.join),
        );
      });
      return DependencyTransformer.of({
        transformFile: (file) =>
          transform(file, () => transformer.transformFile(file)),
        transformData: (file, code, sideEffects) =>
          transform(file, () =>
            transformer.transformData(file, code, false, sideEffects),
          ),
      });
    }),
  );
}

export interface JavaScriptTransformerHost {
  transformFile(file: string): Promise<Uint8Array>;
  transformData(
    file: string,
    code: string,
    sideEffects: boolean,
  ): Promise<Uint8Array>;
  close(): Promise<void>;
}

type State =
  | { readonly _tag: 'Idle' }
  | {
      readonly _tag: 'Active';
      readonly operations: NativeOperations;
      readonly runtime: ManagedRuntime.ManagedRuntime<
        DependencyTransformer,
        JavaScriptTransformerFailure
      >;
    }
  | { readonly _tag: 'Closing'; readonly closed: Promise<void> };

/** Shared native host for the optimizer, fallback linker, and build linker. */
export function createJavaScriptTransformer(
  options: () => JavaScriptTransformOptions,
  cache: Layer.Layer<TransformCache> = transformCacheLayer(),
): JavaScriptTransformerHost {
  let state: State = { _tag: 'Idle' };
  const run = (
    operation: Effect.Effect<
      Uint8Array,
      JavaScriptTransformFailure,
      DependencyTransformer
    >,
  ): Promise<Uint8Array> => {
    if (state._tag !== 'Active') {
      const previous =
        state._tag === 'Closing' ? state.closed : Promise.resolve();
      const layer = Layer.unwrap(
        Effect.as(
          Effect.promise(() => previous),
          dependencyTransformerLayer(options()).pipe(Layer.provide(cache)),
        ),
      );
      state = {
        _tag: 'Active',
        runtime: ManagedRuntime.make(layer),
        operations: new NativeOperations(),
      };
    }
    return state.operations.track(
      state.runtime.runPromise(operation).catch((error: unknown) => {
        throw error instanceof JavaScriptTransformFailure ||
          error instanceof JavaScriptTransformerFailure
          ? error.cause
          : error;
      }),
    );
  };
  return {
    transformFile: (file) =>
      run(
        Effect.flatMap(DependencyTransformer, (service) =>
          service.transformFile(file),
        ),
      ),
    transformData: (file, code, sideEffects) =>
      run(
        Effect.flatMap(DependencyTransformer, (service) =>
          service.transformData(file, code, sideEffects),
        ),
      ),
    close() {
      if (state._tag === 'Closing') return state.closed;
      if (state._tag === 'Idle') return Promise.resolve();
      const current = state;
      const closed = current.operations
        .drain()
        .then(() => current.runtime.dispose());
      state = { _tag: 'Closing', closed };
      return closed;
    },
  };
}
