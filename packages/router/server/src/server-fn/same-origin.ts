/**
 * Same-origin enforcement for the server-function HTTP transport.
 *
 * Server functions are same-origin RPC: a client proxy only ever calls the
 * relative `/_analog/fn/:id` URL of its own app. A cross-origin page must not be
 * able to invoke them against a logged-in user (a CSRF-shaped attack), so the
 * transport rejects browser requests whose origin is not the app's own — out of
 * the box, with no per-app configuration.
 *
 * The signals used (`Sec-Fetch-Site`, `Origin`) are added by the browser and
 * cannot be forged by a cross-origin page's `fetch`. Non-browser callers (curl,
 * server-to-server, SSR in-process) send neither, so they are unaffected: the
 * guard blocks the cross-origin browser attack it is meant to, and nothing else.
 */

import { InjectionToken } from '@angular/core';

import type { ServerFnsFeature } from './interceptors';

/** Node/h3 header bag shape (`IncomingHttpHeaders`). */
export type HeaderBag = Record<string, string | string[] | undefined>;

/**
 * Origins permitted beyond the app's own, registered through DI:
 * `provideServerFns(withAllowedOrigins([...]))`. Empty by default — the
 * transport is same-origin unless an app opts out explicitly.
 */
export const SERVER_FN_ALLOWED_ORIGINS = new InjectionToken<string[]>(
  'SERVER_FN_ALLOWED_ORIGINS',
);

/**
 * `withAllowedOrigins([...])` — permit cross-origin browser calls from the
 * listed origins, or pass `'*'` to disable the same-origin guard entirely.
 * Server functions are frequently cookie-authenticated, so this is an explicit
 * opt-out of CSRF protection: allow-list the exact origins you control.
 */
export function withAllowedOrigins(origins: string[]): ServerFnsFeature {
  return {
    providers: origins.map((origin) => ({
      provide: SERVER_FN_ALLOWED_ORIGINS,
      useValue: origin,
      multi: true,
    })),
  };
}

function firstHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Whether an HTTP request to a server function may proceed.
 *
 * Allowed when the request is same-origin, carries no browser-origin signal at
 * all (a non-browser client, or a same-origin GET that omits `Origin`), or its
 * `Origin` is listed in `allowedOrigins`. Passing `'*'` in `allowedOrigins`
 * disables the check — the explicit opt-in to cross-origin access.
 *
 * `Sec-Fetch-Site` is the authoritative signal when present: `same-origin` and
 * `none` (a direct navigation, not a cross-site fetch) pass; `same-site` and
 * `cross-site` require an explicit `allowedOrigins` entry. When the header is
 * absent (older browsers, some proxies) the `Origin` host is compared to the
 * request host as a fallback.
 */
export function isServerFnOriginAllowed(
  headers: HeaderBag,
  allowedOrigins: readonly string[] = [],
): boolean {
  if (allowedOrigins.includes('*')) {
    return true;
  }

  const origin = firstHeader(headers['origin']);
  const originAllowlisted =
    origin !== undefined && allowedOrigins.includes(origin);

  const site = firstHeader(headers['sec-fetch-site']);
  if (site) {
    if (site === 'same-origin' || site === 'none') {
      return true;
    }
    // same-site / cross-site: only when the origin is explicitly permitted.
    return originAllowlisted;
  }

  // No `Sec-Fetch-Site`: fall back to comparing the `Origin` host to the host.
  if (!origin) {
    // Non-browser client, or a same-origin GET with no `Origin` — not the
    // cross-origin browser request this guard exists to reject.
    return true;
  }
  if (originAllowlisted) {
    return true;
  }

  const host =
    firstHeader(headers['x-forwarded-host']) ?? firstHeader(headers['host']);
  if (!host) {
    return false;
  }
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
