import {
  EnvironmentProviders,
  inject,
  makeEnvironmentProviders,
  REQUEST as ANGULAR_REQUEST,
  RESPONSE_INIT,
} from '@angular/core';

import {
  BASE_URL,
  REQUEST,
  RESPONSE,
  ServerRequest,
  ServerResponse,
} from '@analogjs/router/tokens';

/**
 * Adapts the web Request that @angular/ssr provides through
 * @angular/core's REQUEST token into the node-flavored shape read by
 * Analog's REQUEST token consumers (url, method, headers).
 */
function toServerRequest(request: Request): ServerRequest {
  const url = new URL(request.url);
  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    headers[key] = value;
  });

  return {
    url: `${url.pathname}${url.search}`,
    originalUrl: `${url.pathname}${url.search}`,
    method: request.method,
    headers,
  } as unknown as ServerRequest;
}

/**
 * Adapts @angular/core's RESPONSE_INIT into the subset of the node
 * response Analog's RESPONSE token consumers use — status code and
 * header access — writing through to the init @angular/ssr reads when
 * it builds the response.
 */
function toServerResponse(init: ResponseInit): ServerResponse {
  const headers = new Headers(init.headers);
  init.headers = headers;

  return {
    get statusCode() {
      return init.status ?? 200;
    },
    set statusCode(status: number) {
      init.status = status;
    },
    setHeader(name: string, value: number | string | readonly string[]) {
      headers.set(
        name,
        Array.isArray(value) ? value.join(', ') : String(value),
      );
      return this;
    },
    getHeader(name: string) {
      return headers.get(name) ?? undefined;
    },
    removeHeader(name: string) {
      headers.delete(name);
    },
    hasHeader(name: string) {
      return headers.has(name);
    },
  } as unknown as ServerResponse;
}

/**
 * Bridges Analog's REQUEST / RESPONSE / BASE_URL tokens from the web
 * Request and ResponseInit that @angular/ssr exposes through
 * @angular/core, for apps that server-render without Nitro (e.g. on the
 * esbuild application builder). Each token resolves to null outside of
 * a server request, matching the optional injection Analog's consumers
 * already use.
 *
 * This entry point requires Angular v19+, where @angular/core exposes
 * the REQUEST and RESPONSE_INIT tokens.
 */
export function provideServerRequestContext(): EnvironmentProviders {
  return makeEnvironmentProviders([
    {
      provide: REQUEST,
      useFactory: () => {
        const request = inject(ANGULAR_REQUEST, { optional: true });
        return request ? toServerRequest(request) : null;
      },
    },
    {
      provide: RESPONSE,
      useFactory: () => {
        const init = inject(RESPONSE_INIT, { optional: true });
        return init ? toServerResponse(init) : null;
      },
    },
    {
      provide: BASE_URL,
      useFactory: () => {
        const request = inject(ANGULAR_REQUEST, { optional: true });
        return request ? new URL(request.url).origin : null;
      },
    },
  ]);
}
