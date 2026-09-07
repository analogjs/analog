import { it, expect } from '@effect/vitest';
import * as Cause from 'effect/Cause';
import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';
import * as Layer from 'effect/Layer';
import * as Schema from 'effect/Schema';
import { TestClock } from 'effect/testing';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  CacheStorage,
  TransformCache,
  TransformCacheKey,
  diskCacheLayer,
} from './transform-cache.js';

const key = (n: number) =>
  Schema.decodeUnknownSync(TransformCacheKey)(n.toString(16).padStart(64, '0'));

it.effect(
  'bounds memory, refreshes LRU order, and measures work with the Effect clock',
  () =>
    Effect.gen(function* () {
      const cache = yield* TransformCache;
      expect(yield* cache.get(key(0))).toBeUndefined();
      yield* TestClock.adjust('150 millis');
      yield* cache.put(key(0), new Uint8Array([1]));
      expect(cache.stats.workerMs).toBe(150);
      for (let i = 1; i < 256; i++)
        yield* cache.put(key(i), new Uint8Array([i % 256]));
      expect(yield* cache.get(key(0))).toEqual(new Uint8Array([1]));
      yield* cache.put(key(256), new Uint8Array([2]));
      expect(yield* cache.get(key(1))).toBeUndefined();
      expect(yield* cache.get(key(0))).toEqual(new Uint8Array([1]));
      expect(cache.stats.memoryBytes).toBe(256);
    }).pipe(
      Effect.provide(
        TransformCache.layer.pipe(Layer.provide(CacheStorage.disabled)),
      ),
    ),
);

it.effect(
  'reads across cache instances and reports I/O errors separately from misses',
  () =>
    Effect.gen(function* () {
      const directory = yield* Effect.acquireRelease(
        Effect.promise(() => mkdtemp(join(tmpdir(), 'analog-cache-'))),
        (directory) =>
          Effect.promise(() => rm(directory, { recursive: true, force: true })),
      );
      const run = <A, E>(operation: Effect.Effect<A, E, CacheStorage>) =>
        operation.pipe(Effect.provide(diskCacheLayer(directory)));
      expect(
        yield* run(Effect.flatMap(CacheStorage, (cache) => cache.get(key(0)))),
      ).toBeUndefined();
      yield* run(
        Effect.flatMap(CacheStorage, (cache) =>
          cache.put(key(0), new Uint8Array([1, 2])),
        ),
      );
      expect(
        yield* run(Effect.flatMap(CacheStorage, (cache) => cache.get(key(0)))),
      ).toEqual(Buffer.from([1, 2]));
      yield* run(
        Effect.flatMap(CacheStorage, (cache) =>
          cache.put(key(0), new Uint8Array([3])),
        ),
      );
      expect(
        yield* run(Effect.flatMap(CacheStorage, (cache) => cache.get(key(0)))),
      ).toEqual(Buffer.from([1, 2]));
      const blocker = join(directory, 'blocker');
      yield* Effect.promise(() => writeFile(blocker, 'not a directory'));
      const failed = yield* Effect.exit(
        Effect.flatMap(CacheStorage, (cache) => cache.get(key(1))).pipe(
          Effect.provide(diskCacheLayer(blocker)),
        ),
      );
      expect(Exit.isFailure(failed)).toBe(true);
      if (Exit.isFailure(failed)) {
        expect(Cause.squash(failed.cause)).toMatchObject({
          _tag: 'CacheIoFailure',
          operation: 'read',
        });
      }
    }),
);

it('rejects unsafe native cache keys at the callback boundary', () => {
  expect(() =>
    Schema.decodeUnknownSync(TransformCacheKey)('../escape'),
  ).toThrow();
});
