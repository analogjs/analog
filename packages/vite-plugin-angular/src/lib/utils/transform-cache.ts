import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { VERSION } from '@angular/compiler';
import ts from 'typescript';
import * as Clock from 'effect/Clock';
import * as Context from 'effect/Context';
import * as Data from 'effect/Data';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Result from 'effect/Result';
import * as Schema from 'effect/Schema';

/** The callback boundary required by Angular's JavaScriptTransformer. */
export interface TransformCacheStore {
  get(key: string): Promise<Uint8Array | undefined> | Uint8Array | undefined;
  put(key: string, value: Uint8Array): Promise<void> | void;
}

export const TransformCacheKey: Schema.brand<
  Schema.String,
  'TransformCacheKey'
> = Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/)).pipe(
  Schema.brand('TransformCacheKey'),
);
export type TransformCacheKey = typeof TransformCacheKey.Type;

export class CacheIoFailure extends Data.TaggedError('CacheIoFailure')<{
  readonly operation: 'read' | 'write' | 'cleanup';
  readonly path: string;
  readonly cause: unknown;
}> {}

const missingFile = Schema.decodeUnknownResult(
  Schema.Struct({ code: Schema.Literal('ENOENT') }),
);
const existingFile = Schema.decodeUnknownResult(
  Schema.Struct({ code: Schema.Literal('EEXIST') }),
);

export class CacheStorage extends Context.Service<
  CacheStorage,
  {
    readonly get: (
      key: TransformCacheKey,
    ) => Effect.Effect<Uint8Array | undefined, CacheIoFailure>;
    readonly put: (
      key: TransformCacheKey,
      value: Uint8Array,
    ) => Effect.Effect<void, CacheIoFailure>;
  }
>()('@analogjs/vite-plugin-angular/CacheStorage') {
  static readonly disabled: Layer.Layer<CacheStorage> = Layer.succeed(
    CacheStorage,
    {
      get: () => Effect.succeed(undefined),
      put: () => Effect.void,
    },
  );
}

/** Content-addressed disk adapter; only ENOENT is a cache miss. */
export function diskCacheLayer(baseDir: string): Layer.Layer<CacheStorage> {
  const entry = (key: TransformCacheKey) =>
    path.join(baseDir, key.slice(0, 2), key);
  const get = Effect.fn('analog.cache.read')(function* (
    key: TransformCacheKey,
  ) {
    const file = entry(key);
    return yield* Effect.tryPromise({
      try: () => fs.promises.readFile(file),
      catch: (cause) =>
        new CacheIoFailure({ operation: 'read', path: file, cause }),
    }).pipe(
      Effect.catchIf(
        (error) => Result.isSuccess(missingFile(error.cause)),
        () => Effect.succeed(undefined),
      ),
    );
  });
  const put = Effect.fn('analog.cache.write')(function* (
    key: TransformCacheKey,
    value: Uint8Array,
  ) {
    const file = entry(key);
    const temporary = `${file}.${randomUUID()}`;
    const cleanup = Effect.tryPromise({
      try: () => fs.promises.unlink(temporary),
      catch: (cause) =>
        new CacheIoFailure({ operation: 'cleanup', path: temporary, cause }),
    }).pipe(
      Effect.catchIf(
        (error) => Result.isSuccess(missingFile(error.cause)),
        () => Effect.void,
      ),
      Effect.orDie,
    );
    yield* Effect.tryPromise({
      try: async () => {
        await fs.promises.mkdir(path.dirname(file), { recursive: true });
        await fs.promises.writeFile(temporary, value, { flag: 'wx' });
        try {
          // Publish a complete immutable entry without replacing another
          // writer's entry (or following an existing destination symlink).
          await fs.promises.link(temporary, file);
        } catch (cause) {
          if (!Result.isSuccess(existingFile(cause))) throw cause;
        }
      },
      catch: (cause) =>
        new CacheIoFailure({ operation: 'write', path: file, cause }),
    }).pipe(Effect.uninterruptible, Effect.ensuring(cleanup));
  });
  return Layer.succeed(CacheStorage, { get, put });
}

export interface TransformCacheStats {
  hits: number;
  misses: number;
  writes: number;
  workerMs: number;
  memoryBytes: number;
}

export class TransformCache extends Context.Service<
  TransformCache,
  {
    readonly get: CacheStorage['Service']['get'];
    readonly put: CacheStorage['Service']['put'];
    readonly stats: Readonly<TransformCacheStats>;
  }
>()('@analogjs/vite-plugin-angular/TransformCache') {
  static readonly layer: Layer.Layer<TransformCache, never, CacheStorage> =
    Layer.effect(
      TransformCache,
      Effect.gen(function* () {
        const storage = yield* CacheStorage;
        const clock = yield* Clock.Clock;
        const memory = new Map<TransformCacheKey, Uint8Array>();
        const missedAt = new Map<TransformCacheKey, number>();
        const stats: TransformCacheStats = {
          hits: 0,
          misses: 0,
          writes: 0,
          workerMs: 0,
          memoryBytes: 0,
        };
        // Bound both entry count and bytes: a large dependency cannot retain an
        // unbounded buffer graph for the lifetime of a dev server.
        const remember = (key: TransformCacheKey, value: Uint8Array) => {
          stats.memoryBytes -= memory.get(key)?.byteLength ?? 0;
          memory.delete(key);
          memory.set(key, value);
          stats.memoryBytes += value.byteLength;
          while (memory.size > 256 || stats.memoryBytes > 64 * 1024 * 1024) {
            const first = memory.keys().next().value;
            if (first === undefined) break;
            stats.memoryBytes -= memory.get(first)?.byteLength ?? 0;
            memory.delete(first);
          }
        };
        yield* Effect.addFinalizer(() =>
          Effect.sync(() => {
            memory.clear();
            missedAt.clear();
            stats.memoryBytes = 0;
          }),
        );
        const get = Effect.fn('analog.cache.get')(function* (
          key: TransformCacheKey,
        ) {
          const value = memory.get(key) ?? (yield* storage.get(key));
          if (value !== undefined) {
            remember(key, value);
            stats.hits++;
          } else {
            stats.misses++;
            missedAt.set(key, yield* clock.currentTimeMillis);
            if (missedAt.size > 256) {
              const first = missedAt.keys().next().value;
              if (first !== undefined) missedAt.delete(first);
            }
          }
          return value;
        });
        const put = Effect.fn('analog.cache.put')(function* (
          key: TransformCacheKey,
          value: Uint8Array,
        ) {
          yield* storage.put(key, value);
          remember(key, value);
          const started = missedAt.get(key);
          missedAt.delete(key);
          if (started !== undefined)
            stats.workerMs += (yield* clock.currentTimeMillis) - started;
          stats.writes++;
        });
        return TransformCache.of({ get, put, stats });
      }),
    );
}

export function transformCacheLayer(
  directory?: string,
): Layer.Layer<TransformCache> {
  return TransformCache.layer.pipe(
    Layer.provide(
      directory ? diskCacheLayer(directory) : CacheStorage.disabled,
    ),
  );
}

/** Namespace native content hashes by all toolchain versions they omit. */
export function resolveTransformCacheDir(startDir: string): string | undefined {
  if (process.env['ANALOG_TRANSFORM_CACHE'] === '0') return undefined;
  let dir = path.resolve(startDir);
  for (;;) {
    if (fs.existsSync(path.join(dir, 'node_modules'))) {
      const require = createRequire(import.meta.url);
      const builder: { version: string } = require(
        Number(VERSION.major) === 17
          ? '@angular-devkit/build-angular/package.json'
          : '@angular/build/package.json',
      );
      const namespace = createHash('sha256')
        .update(
          JSON.stringify({
            format: 2,
            compiler: VERSION.full,
            builder: builder.version,
            typescript: ts.version,
            node: process.versions.node,
          }),
        )
        .digest('hex');
      return path.join(
        dir,
        'node_modules',
        '.cache',
        'analog',
        'transform-cache',
        namespace,
      );
    }
    const parent = path.dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}
