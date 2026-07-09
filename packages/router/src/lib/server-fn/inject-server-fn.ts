import {
  Injectable,
  assertInInjectionContext,
  inject,
  makeStateKey,
  resource,
  TransferState,
  type ResourceRef,
} from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

import type { ServerFn } from './types';

/**
 * Client transport for server functions. Goes through Angular `HttpClient`, so
 * client `HttpInterceptorFn`s apply. Lives in the client entry (client-safe).
 */
@Injectable({ providedIn: 'root' })
export class ServerFnClient {
  private readonly http = inject(HttpClient);
  private readonly transferState = inject(TransferState);

  async call<In, Out>(fn: ServerFn<In, Out>, input: In): Promise<Out> {
    const request$ =
      fn.method === 'GET'
        ? this.http.get<Out>(fn.url)
        : this.http.post<Out>(fn.url, input ?? {});
    return firstValueFrom(request$);
  }

  /** Key a read's value for TransferState hydration (fn id + input). */
  stateKey<Out>(fn: ServerFn<unknown, Out>, input: unknown) {
    return makeStateKey<Out>(`__analog_fn_${fn.id}_${stableInput(input)}`);
  }

  readSeed<Out>(fn: ServerFn<unknown, Out>, input: unknown): Out | undefined {
    const key = this.stateKey(fn, input);
    if (this.transferState.hasKey(key)) {
      const value = this.transferState.get(key, undefined as unknown as Out);
      this.transferState.remove(key); // single-use
      return value;
    }
    return undefined;
  }

  writeSeed<Out>(fn: ServerFn<unknown, Out>, input: unknown, value: Out): void {
    this.transferState.set(this.stateKey(fn, input), value);
  }
}

/** No-op provider hook; ServerFnClient is `providedIn: 'root'`. */
export function provideServerFnClient() {
  return [] as const;
}

// Overloads: reactive read -> ResourceRef; no args -> bound callable.
export function injectServerFn<In, Out>(
  fn: ServerFn<In, Out>,
  args: () => In,
): ResourceRef<Out | undefined>;
export function injectServerFn<In, Out>(
  fn: ServerFn<In, Out>,
): (input: In) => Promise<Out>;
export function injectServerFn<In, Out>(
  fn: ServerFn<In, Out>,
  args?: () => In,
) {
  assertInInjectionContext(injectServerFn);
  const client = inject(ServerFnClient);

  if (!args) {
    return (input: In) => client.call(fn, input);
  }

  return resource<Out | undefined, In>({
    params: () => args(),
    loader: async ({ params }) => {
      // Hydrate from the SSR seed on first client render; else fetch and (on
      // the server) seed for the client.
      const seeded = client.readSeed(fn as ServerFn<unknown, Out>, params);
      if (seeded !== undefined) return seeded;
      const value = await client.call(fn, params);
      client.writeSeed(fn as ServerFn<unknown, Out>, params, value);
      return value;
    },
  });
}

function stableInput(input: unknown): string {
  if (input === undefined || input === null) return '_';
  return JSON.stringify(input);
}
