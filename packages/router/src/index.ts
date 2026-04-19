export type { RouteExport } from './lib/models';
export type { Files } from './lib/route-files';
export { routes, createRoutes } from './lib/routes';
export {
  defineRouteMeta,
  injectActivatedRoute,
  injectRouter,
} from './lib/define-route';
export type { RouteMeta } from './lib/models';
export { provideFileRouter, withExtraRoutes } from './lib/provide-file-router';
export type { MetaTag } from './lib/meta-tags';
export type {
  PageServerLoad,
  LoadResult,
  LoadDataResult,
} from './lib/route-types';
export { injectLoad, injectLoadData } from './lib/inject-load';
export { getLoadResolver } from './lib/get-load-resolver';
export { requestContextInterceptor } from './lib/request-context';
export { injectRouteEndpointURL } from './lib/inject-route-endpoint-url';
export { FormAction } from './lib/form-action.directive';
export type { FormActionState } from './lib/form-action.directive';
export { injectDebugRoutes } from './lib/debug/routes';
export { withDebugRoutes } from './lib/debug';
export { ServerOnly } from './lib/server.component';
export type { AnalogJsonLdDocument } from './lib/json-ld';
export {
  issuesToFieldErrors,
  issuesToFormErrors,
  issuePathToFieldName,
} from './lib/validation-errors';
export type { ValidationFieldErrors } from './lib/validation-errors';

// Typed file routes
export type {
  AnalogRouteTable,
  AnalogRoutePath,
  RoutePathOptions,
  RoutePathArgs,
  RoutePathOptionsBase,
  RouteParamsOutput,
  RouteQueryOutput,
  RouteLinkResult,
} from './lib/route-path';
export { routePath } from './lib/route-path';
export { injectNavigate } from './lib/inject-navigate';

// Experimental features (TanStack Router-inspired)
export {
  withTypedRouter,
  withRouteContext,
  withLoaderCaching,
  EXPERIMENTAL_TYPED_ROUTER,
  EXPERIMENTAL_ROUTE_CONTEXT,
  EXPERIMENTAL_LOADER_CACHE,
} from './lib/experimental';
export type {
  TypedRouterOptions,
  LoaderCacheOptions,
} from './lib/experimental';
export { injectParams, injectQuery } from './lib/inject-typed-params';
export { injectRouteContext } from './lib/inject-route-context';

// i18n
export {
  provideI18n,
  I18nConfig,
  injectSwitchLocale,
  loadTranslationsRuntime,
} from './lib/i18n/provide-i18n';
