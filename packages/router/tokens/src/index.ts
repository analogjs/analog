import { InjectionToken, inject } from '@angular/core';
import type {
  IncomingMessage,
  ServerResponse as NodeServerResponse,
} from 'node:http';

export type ServerRequest = IncomingMessage & { originalUrl: string };
export type ServerResponse = NodeServerResponse;
export type ServerContext = { req: ServerRequest; res: ServerResponse };

export const REQUEST = new InjectionToken<ServerRequest>(
  '@analogjs/router Server Request'
);
export const RESPONSE = new InjectionToken<ServerResponse>(
  '@analogjs/router Server Response'
);
export const BASE_URL = new InjectionToken<string>('@analogjs/router Base URL');

export const API_PREFIX = new InjectionToken<string>(
  '@analogjs/router API Prefix'
);

export function injectRequest() {
  return inject(REQUEST, { optional: true });
}

export function injectResponse() {
  return inject(RESPONSE, { optional: true });
}

export function injectBaseURL() {
  return inject(BASE_URL, { optional: true });
}

export function injectAPIPrefix() {
  return inject(API_PREFIX);
}
