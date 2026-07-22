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
import { SERVER_FN_DISPATCHER } from './dispatcher';

/**
 * Client transport for server functions. In the browser it goes through Angular
 * `HttpClient`, so client `HttpInterceptorFn`s apply. During SSR the dispatcher
 * token is provided, and the call short-circuits the HTTP round-trip: the
 * handler runs in-process in the current request injector. Lives in the client
 * entry (client-safe).
 */
@Injectable({ providedIn: 'root' })
export class ServerFnClient {
  private readonly http = inject(HttpClient);
  private readonly transferState = inject(TransferState);
  private readonly dispatcher = inject(SERVER_FN_DISPATCHER, {
    optional: true,
  });

  /** True while rendering on the server (the in-process dispatcher is provided). */
  get isServer(): boolean {
    return !!this.dispatcher;
  }

  async call<In, Out>(fn: ServerFn<In, Out>, input: In): Promise<Out> {
    if (this.dispatcher) {
      return this.dispatcher(fn, input);
    }

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

// Stable sentinel for the input-less read: `resource()` treats an `undefined`
// params value as "idle, don't load", so an input-less read must yield a
// defined-but-ignored params. It is never sent — the call uses `undefined`.
const NO_INPUT = Symbol('analog.serverFn.noInput');

/**
 * Reactive read of a server function as an Angular `resource()`.
 *
 * `args` is optional: omit it for an input-less read (the resource loads once);
 * provide it for an input-bearing read (returning `undefined` from `args` leaves
 * the resource idle until inputs are ready, the standard resource pattern). For
 * imperative calls (mutations, event handlers) use `injectServerFnMutation`.
 */
export function injectServerFn<Out>(
  fn: ServerFn<void, Out>,
): ResourceRef<Out | undefined>;
export function injectServerFn<In, Out>(
  fn: ServerFn<In, Out>,
  args: () => In | undefined,
): ResourceRef<Out | undefined>;
export function injectServerFn<In, Out>(
  fn: ServerFn<In, Out>,
  args?: () => In | undefined,
): ResourceRef<Out | undefined> {
  assertInInjectionContext(injectServerFn);
  const client = inject(ServerFnClient);

  return resource<Out | undefined, unknown>({
    params: () => (args ? args() : NO_INPUT),
    loader: async ({ params }) => {
      const input = (params === NO_INPUT ? undefined : params) as In;
      // Hydrate from the SSR seed on first client render; else fetch and (on
      // the server) seed for the client.
      const seeded = client.readSeed(fn as ServerFn<unknown, Out>, input);
      if (seeded !== undefined) return seeded;
      const value = await client.call(fn, input);
      if (client.isServer) {
        client.writeSeed(fn as ServerFn<unknown, Out>, input, value);
      }
      return value;
    },
  });
}

/**
 * Imperative binding of a server function: returns a callable that dispatches
 * the call through `HttpClient` (so client interceptors apply) and resolves the
 * result. Use for mutations and event-driven calls; use `injectServerFn` for
 * reactive reads.
 */
export function injectServerFnMutation<In, Out>(
  fn: ServerFn<In, Out>,
): (input: In) => Promise<Out> {
  assertInInjectionContext(injectServerFnMutation);
  const client = inject(ServerFnClient);
  return (input: In) => client.call(fn, input);
}

function stableInput(input: unknown): string {
  if (input === undefined || input === null) return '_';
  return JSON.stringify(input);
}
