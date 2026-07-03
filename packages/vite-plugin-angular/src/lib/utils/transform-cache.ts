import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { VERSION } from '@angular/compiler';
import { createDebug } from 'obug';

const debugCache = createDebug('analog-transform-cache');

/**
 * The `{ get, put }` shape `@angular/build`'s `JavaScriptTransformer`
 * accepts as its third constructor argument. Keys are SHA-256 digests the
 * transformer derives from the file bytes plus every option that affects
 * output, so entries are immutable and never need invalidation — but the
 * digest does NOT cover the linker version, so stores must be namespaced
 * by Angular version (see {@link resolveTransformCacheDir}).
 */
export interface TransformCacheStore {
  get(key: string): Promise<Uint8Array | undefined> | Uint8Array | undefined;
  put(key: string, value: Uint8Array): Promise<void> | void;
}

interface TransformCacheStats {
  hits: number;
  misses: number;
  writes: number;
  /** Approximate total ms spent in the linker worker for cache misses. */
  workerMs: number;
}

/**
 * Disk-backed content-addressed store for linked/transformed dependency
 * output. Entries are written atomically (temp + rename) so concurrent
 * dev servers can share a directory; all failures degrade to a miss.
 */
export function createPersistentTransformCache(
  baseDir: string,
): TransformCacheStore & { stats: TransformCacheStats } {
  const stats: TransformCacheStats = {
    hits: 0,
    misses: 0,
    writes: 0,
    workerMs: 0,
  };
  // Miss timestamps by key: with the transformer's serialized worker, the
  // gap between a missed get and its put approximates linker time per file.
  const missedAt = new Map<string, number>();

  const entryPath = (key: string) => path.join(baseDir, key.slice(0, 2), key);

  return {
    stats,
    async get(key: string): Promise<Uint8Array | undefined> {
      try {
        const value = await fs.promises.readFile(entryPath(key));
        stats.hits++;
        debugCache('hit %s (hits=%d misses=%d)', key, stats.hits, stats.misses);
        return value;
      } catch {
        stats.misses++;
        missedAt.set(key, performance.now());
        debugCache(
          'miss %s (hits=%d misses=%d)',
          key,
          stats.hits,
          stats.misses,
        );
        return undefined;
      }
    },
    async put(key: string, value: Uint8Array): Promise<void> {
      const startedAt = missedAt.get(key);
      if (startedAt !== undefined) {
        missedAt.delete(key);
        stats.workerMs += performance.now() - startedAt;
      }
      try {
        const file = entryPath(key);
        await fs.promises.mkdir(path.dirname(file), { recursive: true });
        const tmp = `${file}.${process.pid}.${crypto.randomBytes(4).toString('hex')}`;
        await fs.promises.writeFile(tmp, value);
        await fs.promises.rename(tmp, file);
        stats.writes++;
        debugCache(
          'put %s (writes=%d workerMs=%d)',
          key,
          stats.writes,
          Math.round(stats.workerMs),
        );
      } catch (e) {
        debugCache('put failed %s: %s', key, (e as Error)?.message);
      }
    },
  };
}

/**
 * Layer an unbounded in-memory map over a persistent store so repeat
 * transforms in the same session never touch the disk.
 */
export function withMemoryLayer(
  store: TransformCacheStore,
): TransformCacheStore {
  const memory = new Map<string, Uint8Array>();
  return {
    async get(key: string): Promise<Uint8Array | undefined> {
      const cached = memory.get(key) ?? (await store.get(key));
      if (cached) memory.set(key, cached);
      return cached;
    },
    async put(key: string, value: Uint8Array): Promise<void> {
      memory.set(key, value);
      await store.put(key, value);
    },
  };
}

/**
 * Resolve the shared on-disk cache directory: `node_modules/.cache` at the
 * nearest `node_modules` above `startDir` — the conventional tool-cache
 * location, so installs and `node_modules` cleans evict it without a
 * separate eviction pass. Namespaced by the installed Angular version
 * because the transformer's cache key does not cover the linker version.
 * Returns `null` (caching disabled) when no `node_modules` exists or the
 * `ANALOG_TRANSFORM_CACHE=0` kill switch is set.
 */
export function resolveTransformCacheDir(startDir: string): string | null {
  if (process.env['ANALOG_TRANSFORM_CACHE'] === '0') return null;
  let dir = path.resolve(startDir);
  for (;;) {
    if (fs.existsSync(path.join(dir, 'node_modules'))) {
      return path.join(
        dir,
        'node_modules',
        '.cache',
        'analog',
        'transform-cache',
        VERSION.full,
      );
    }
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}
