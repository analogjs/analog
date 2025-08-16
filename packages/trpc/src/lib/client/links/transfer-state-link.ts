import type { Operation, TRPCLink } from '@trpc/client';
import { observable } from '@trpc/server/observable';
import {
  inject,
  makeStateKey,
  type StateKey,
  TransferState,
} from '@angular/core';
import type { AnyRouter } from '@trpc/server';
import { tRPC_CACHE_STATE } from '../cache-state';
import superjson from 'superjson';

function makeCacheKey(request: Operation<unknown>): StateKey<string> {
  const { type, path, input } = request;
  const encodedParams = Object.entries(input ?? {}).reduce(
    (prev, [key, value]) => prev + `${key}=${JSON.stringify(value)}`,
    '',
  );
  const key = type + '.' + path + '?' + encodedParams;
  const hash = generateHash(key);
  return makeStateKey(hash);
}

/**
 * A method that returns a hash representation of a string using a variant of DJB2 hash
 * algorithm.
 *
 * This is the same hashing logic that is used to generate component ids.
 */
function generateHash(value: string): string {
  let hash = 0;

  for (const char of value) {
    hash = (Math.imul(31, hash) + char.charCodeAt(0)) << 0;
  }

  // Force positive number hash.
  // 2147483647 = equivalent of Integer.MAX_VALUE.
  hash += 2147483647 + 1;

  return hash.toString();
}

export const transferStateLink =
  <AppRouter extends AnyRouter>(): TRPCLink<AppRouter> =>
  () => {
    const { isCacheActive } = inject(tRPC_CACHE_STATE);
    const transferState = inject(TransferState);
    const isBrowser = typeof window === 'object';

    return ({ next, op }) => {
      // Only process queries
      if (op.type !== 'query') {
        return next(op);
      }

      const storeKey = makeCacheKey(op);
      const storeValue = transferState.get(storeKey, null);

      // Client-side: Check for cached data first to prevent double fetching
      if (isBrowser && storeValue) {
        // Use cached data from server and remove it from transfer state
        transferState.remove(storeKey);
        return observable((observer) => {
          observer.next(superjson.parse(storeValue));
          observer.complete();
        });
      }

      // Server-side: Always cache queries
      // Client-side: Only cache during initial hydration (when isCacheActive is true)
      const shouldCache = !isBrowser || isCacheActive.getValue();

      if (!shouldCache) {
        return next(op);
      }

      return observable((observer) => {
        return next(op).subscribe({
          next(value) {
            // Store returned value in TransferState for future use
            transferState.set(storeKey, superjson.stringify(value));
            observer.next(value);
          },
          error(err) {
            transferState.remove(storeKey);
            observer.error(err);
          },
          complete() {
            observer.complete();
          },
        });
      });
    };
  };
