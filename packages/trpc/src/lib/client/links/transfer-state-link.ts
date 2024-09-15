import { Operation, TRPCLink } from '@trpc/client';
import { observable } from '@trpc/server/observable';
import { inject, makeStateKey, StateKey, TransferState } from '@angular/core';
import { AnyRouter } from '@trpc/server';
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
    // here we just got initialized in the app - this happens once per app
    // useful for storing cache for instance
    return ({ next, op }) => {
      const shouldUseCache =
        (op.type === 'query' && !isBrowser) || // always fetch new values on the server
        isCacheActive.getValue(); // or when initializing the client app --> same behavior as HttpClient

      if (!shouldUseCache) {
        return next(op);
      }

      const storeKey = makeCacheKey(op);
      const storeValue = transferState.get(storeKey, null);

      if (storeValue && isBrowser) {
        // on the server we don't care about the value we will always fetch a new one
        // use superjson to parse our superjson string and retrieve our
        // data return it instead of calling next trpc link
        return observable((observer) =>
          observer.next(superjson.parse(storeValue)),
        );
      }

      return observable((observer) => {
        return next(op).subscribe({
          next(value) {
            // store returned value from trpc call stringified with superjson in TransferState
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
