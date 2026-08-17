export * from './request-handler';

import {
  EnvironmentProviders,
  inject,
  makeEnvironmentProviders,
  REQUEST as ANGULAR_REQUEST,
  RESPONSE_INIT,
} from '@angular/core';
import {
  provideServerRendering,
  withRoutes as withSsrRoutes,
  RenderMode,
  type ServerRoute,
} from '@angular/ssr';
import {
  createServerRoutePaths,
  ɵanalogEsbuildMaps as analogEsbuildMaps,
  type Files,
} from '@analogjs/router';

import {
  BASE_URL,
  LOCALE,
  REQUEST,
  RESPONSE,
  ServerRequest,
  ServerResponse,
  detectLocale,
} from '@analogjs/router/tokens';
import { SERVER_FN_DISPATCHER } from '@analogjs/router';
import { createServerFnDispatcher } from '@analogjs/router/server';

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
 * Bridges Analog's REQUEST / RESPONSE / BASE_URL / LOCALE tokens from
 * the web Request and ResponseInit that @angular/ssr exposes through
 * @angular/core, for apps that server-render without Nitro (e.g. on the
 * esbuild application builder). The locale is detected the same way as
 * the Nitro server context — URL path prefix first, then the
 * Accept-Language header — and flows into locale-aware content via
 * `withLocale({ loadLocale: injectLocale })`. Each token resolves to
 * null outside of a server request, matching the optional injection
 * Analog's consumers already use.
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
    {
      provide: LOCALE,
      useFactory: () => {
        const request = inject(ANGULAR_REQUEST, { optional: true });
        return request
          ? (detectLocale(toServerRequest(request)) ?? null)
          : null;
      },
    },
    // Server functions called while rendering dispatch in-process instead
    // of an HTTP round-trip, same as the Nitro server context. During
    // prerendering there is no request, so dispatch runs against a
    // synthetic one and the resolved values are baked into the page —
    // Nitro's prerender behavior. Handlers reading request state see the
    // empty synthetic request, the same trade an author accepts when
    // prerendering such a page on the Nitro path.
    {
      provide: SERVER_FN_DISPATCHER,
      useFactory: () => {
        const request = inject(ANGULAR_REQUEST, { optional: true });
        const init = inject(RESPONSE_INIT, { optional: true });
        return createServerFnDispatcher(
          request
            ? toServerRequest(request)
            : ({
                url: '/',
                originalUrl: '/',
                method: 'GET',
                headers: { host: 'localhost' },
              } as unknown as ServerRequest),
          toServerResponse(init ?? {}),
        );
      },
    },
  ]);
}

export interface AnalogServerRoutesOptions {
  /**
   * The `analog:page-endpoints` map. Routes backed by a `.server.ts`
   * page endpoint render per request — their load resolver fetches the
   * live endpoint, which prerendering does not have.
   */
  pageEndpoints?: Record<string, unknown>;
  /**
   * Overrides the build-extracted route metadata map (pages declaring
   * `routeMeta.prerender: false` render per request).
   */
  routeFilesMeta?: Record<string, { prerender?: boolean; streaming?: boolean }>;
  /** Adds the `withDebugRoutes` page (`__analog/routes`). */
  debugRoutes?: boolean;
  /** Extra entries appended verbatim, for routes outside the file map. */
  serverRoutes?: ServerRoute[];
}

/**
 * Derives the @angular/ssr server route configuration from the route
 * files map: static paths prerender, dynamic module-backed paths
 * prerender the parameter sets their routeMeta.getPrerenderParams
 * provides, and everything server-backed — endpoint-backed pages,
 * pages declaring `routeMeta.prerender: false`, dynamic paths without
 * params — renders per request.
 */
export function createAnalogServerRoutes(
  files: Files,
  options: AnalogServerRoutesOptions = {},
): ServerRoute[] {
  const pageEndpoints =
    options.pageEndpoints ?? analogEsbuildMaps().pageEndpoints ?? {};
  const routeFilesMeta =
    options.routeFilesMeta ?? analogEsbuildMaps().routeFilesMeta ?? {};

  return [
    ...createServerRoutePaths(files).map((route): ServerRoute => {
      const endpointKey = route.filename?.replace(
        /\.page\.(ts|analog|ag)$/,
        '.server.ts',
      );
      // A streamed page is per-request by definition, so it counts as
      // an explicit prerender opt-out even without the flag.
      const meta = route.filename ? routeFilesMeta[route.filename] : undefined;
      if (
        meta?.prerender === false ||
        meta?.streaming === true ||
        (endpointKey && pageEndpoints[endpointKey])
      ) {
        return { path: route.path, renderMode: RenderMode.Server };
      }
      if (!route.isDynamic) {
        return { path: route.path, renderMode: RenderMode.Prerender };
      }
      if (route.getPrerenderParams) {
        return {
          path: route.path,
          renderMode: RenderMode.Prerender,
          getPrerenderParams: route.getPrerenderParams,
        };
      }
      return { path: route.path, renderMode: RenderMode.Server };
    }),
    ...(options.debugRoutes
      ? [{ path: '__analog/routes', renderMode: RenderMode.Server } as const]
      : []),
    ...(options.serverRoutes ?? []),
  ];
}

export interface AnalogServerRenderingConfig {
  /** Overrides the `analog:route-files` map (loaded automatically). */
  routeFiles?: Files;
  /** Overrides the `analog:page-endpoints` map (loaded automatically). */
  pageEndpoints?: Record<string, unknown>;
  /** Overrides the build-extracted route metadata (loaded automatically). */
  routeFilesMeta?: Record<string, { prerender?: boolean; streaming?: boolean }>;
  /** Adds the `withDebugRoutes` page (`__analog/routes`). */
  debugRoutes?: boolean;
}

export interface AnalogServerRenderingFeature {
  ɵkind: 'config' | 'routes';
  ɵconfig?: AnalogServerRenderingConfig;
  ɵroutes?: ServerRoute[];
}

/**
 * Configures `provideAnalogServerRendering` — the debug routes flag and
 * the map overrides for tests and custom setups.
 */
export function withConfig(
  config: AnalogServerRenderingConfig,
): AnalogServerRenderingFeature {
  return { ɵkind: 'config', ɵconfig: config };
}

/**
 * Appends server routes for paths outside the file map — e.g. covering
 * routes registered through `withExtraRoutes` in the app config, which
 * @angular/ssr requires a render mode for.
 */
export function withRoutes(
  routes: ServerRoute[],
): AnalogServerRenderingFeature {
  return { ɵkind: 'routes', ɵroutes: routes };
}

/**
 * One-call server rendering setup for the esbuild application builder:
 * @angular/ssr server routes derived from the discovered route files
 * (endpoint-backed pages render per request via the page endpoints map)
 * plus the Analog request context bridge — REQUEST/RESPONSE/BASE_URL/
 * LOCALE and the in-process server-function dispatcher.
 *
 * ```ts
 * // app.config.server.ts
 * export const config = mergeApplicationConfig(appConfig, {
 *   providers: [
 *     provideAnalogServerRendering(
 *       withConfig({ debugRoutes: true }),
 *       withRoutes([{ path: 'about', renderMode: RenderMode.Server }]),
 *     ),
 *   ],
 * });
 * ```
 */
export function provideAnalogServerRendering(
  ...features: AnalogServerRenderingFeature[]
): EnvironmentProviders {
  const config = features
    .filter((feature) => feature.ɵkind === 'config')
    .reduce<AnalogServerRenderingConfig>(
      (merged, feature) => ({ ...merged, ...feature.ɵconfig }),
      {},
    );
  const serverRoutes = features.flatMap((feature) => feature.ɵroutes ?? []);

  return makeEnvironmentProviders([
    provideServerRendering(
      withSsrRoutes(
        createAnalogServerRoutes(
          config.routeFiles ?? analogEsbuildMaps().routeFiles ?? {},
          { ...config, serverRoutes },
        ),
      ),
    ),
    provideServerRequestContext(),
  ]);
}
