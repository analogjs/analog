import {
  Injector,
  runInInjectionContext,
  type StaticProvider,
} from '@angular/core';
import { REQUEST, RESPONSE } from '@analogjs/router/tokens';
import type { H3Event } from 'h3';

import { serverFnRegistry } from './registry';
import { SERVER_FN_INTERCEPTORS, runInterceptors } from './interceptors';

export interface DispatchResult {
  status: number;
  body: unknown;
}

/**
 * Server-side dispatch for a server function call.
 *
 * 1. look up the function by id
 * 2. validate `input` against the Standard-Schema (4xx on failure)
 * 3. build a per-request injector (REQUEST/RESPONSE + app providers)
 * 4. run the interceptor chain, then the handler, inside `runInInjectionContext`
 *    so `inject()` works and the accumulated context reaches the handler
 * 5. a `Response` returned by an interceptor/handler (`fail`/`redirect`)
 *    short-circuits with its status
 */
export async function dispatchServerFn(
  id: string,
  rawInput: unknown,
  event: Pick<H3Event, 'node'>,
  appProviders: StaticProvider[] = [],
): Promise<DispatchResult> {
  const def = serverFnRegistry.get(id);
  if (!def) {
    return { status: 404, body: { message: `Unknown server function: ${id}` } };
  }

  let input = rawInput;
  if (def.config.input) {
    const result = await def.config.input['~standard'].validate(rawInput);
    if ('issues' in result && result.issues) {
      return { status: 400, body: { errors: result.issues } };
    }
    input = (result as { value: unknown }).value;
  }

  const injector = Injector.create({
    providers: [
      { provide: REQUEST, useValue: event.node.req },
      { provide: RESPONSE, useValue: event.node.res },
      ...appProviders,
    ],
  });

  const outcome = await runInInjectionContext(injector, () => {
    const interceptors = injector.get(SERVER_FN_INTERCEPTORS, []);
    return runInterceptors(interceptors, input, def.handler);
  });

  if (outcome instanceof Response) {
    const text = await outcome.text();
    const body = text ? safeJson(text) : null;
    return { status: outcome.status, body };
  }

  return { status: 200, body: outcome };
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
