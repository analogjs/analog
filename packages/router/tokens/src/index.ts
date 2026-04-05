import { InjectionToken, inject } from '@angular/core';
import type { $Fetch } from 'nitro/types';
import type {
  IncomingMessage,
  ServerResponse as NodeServerResponse,
} from 'node:http';

export type ServerRequest = IncomingMessage & { originalUrl: string };
export type ServerResponse = NodeServerResponse;
export type ServerInternalFetch = $Fetch;
export type ServerContext = {
  req: ServerRequest;
  res: ServerResponse;
  fetch?: ServerInternalFetch;
};

export const REQUEST: InjectionToken<ServerRequest> =
  new InjectionToken<ServerRequest>('@analogjs/router Server Request');
export const RESPONSE: InjectionToken<ServerResponse> =
  new InjectionToken<ServerResponse>('@analogjs/router Server Response');
export const BASE_URL: InjectionToken<string> = new InjectionToken<string>(
  '@analogjs/router Base URL',
);
export const INTERNAL_FETCH: InjectionToken<ServerInternalFetch> =
  new InjectionToken<ServerInternalFetch>(
    '@analogjs/router Internal Server Fetch',
  );

export const API_PREFIX: InjectionToken<string> = new InjectionToken<string>(
  '@analogjs/router API Prefix',
);

export function injectRequest(): ServerRequest | null {
  return inject(REQUEST, { optional: true });
}

export function injectResponse(): ServerResponse | null {
  return inject(RESPONSE, { optional: true });
}

export function injectBaseURL(): string | null {
  return inject(BASE_URL, { optional: true });
}

export function injectInternalServerFetch(): ServerInternalFetch | null {
  return inject(INTERNAL_FETCH, { optional: true });
}

export function injectAPIPrefix(): string {
  return inject(API_PREFIX);
}
