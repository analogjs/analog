export type { RouteExport } from '../../src/lib/models';
export type { Files } from './lib/routes';
export { ANALOG_CONTENT_ROUTE_FILES, createRoutes, routes } from './lib/routes';
export {
  defineRouteMeta,
  injectActivatedRoute,
  injectRouter,
} from '../../src/lib/define-route';
export type { RouteMeta } from '../../src/lib/models';
export { provideFileRouter, withExtraRoutes } from './lib/provide-file-router';
export type { MetaTag } from '../../src/lib/meta-tags';
export type {
  PageServerLoad,
  LoadResult,
  LoadDataResult,
} from '../../src/lib/route-types';
export { injectLoad, injectLoadData } from '../../src/lib/inject-load';
export { getLoadResolver } from '../../src/lib/get-load-resolver';
export { requestContextInterceptor } from '../../src/lib/request-context';
export { injectRouteEndpointURL } from '../../src/lib/inject-route-endpoint-url';
export { FormAction } from '../../src/lib/form-action.directive';
export type { FormActionState } from '../../src/lib/form-action.directive';
export { injectDebugRoutes } from './lib/debug/routes';
export { withDebugRoutes } from '../../src/lib/debug';
export { ServerOnly } from '../../src/lib/server.component';
export type { AnalogJsonLdDocument } from '../../src/lib/json-ld';
export {
  issuesToFieldErrors,
  issuesToFormErrors,
  issuePathToFieldName,
} from '../../src/lib/validation-errors';
export type { ValidationFieldErrors } from '../../src/lib/validation-errors';

export type {
  AnalogRouteTable,
  AnalogRoutePath,
  RoutePathOptions,
  RoutePathArgs,
  RoutePathOptionsBase,
  RouteParamsOutput,
  RouteQueryOutput,
  RouteLinkResult,
} from '../../src/lib/route-path';
export { routePath } from '../../src/lib/route-path';
export { injectNavigate } from '../../src/lib/inject-navigate';

export {
  withTypedRouter,
  withRouteContext,
  withLoaderCaching,
  EXPERIMENTAL_TYPED_ROUTER,
  EXPERIMENTAL_ROUTE_CONTEXT,
  EXPERIMENTAL_LOADER_CACHE,
} from '../../src/lib/experimental';
export type {
  TypedRouterOptions,
  LoaderCacheOptions,
} from '../../src/lib/experimental';
export { injectParams, injectQuery } from '../../src/lib/inject-typed-params';
export { injectRouteContext } from '../../src/lib/inject-route-context';
