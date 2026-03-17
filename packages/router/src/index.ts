export type { RouteExport } from './lib/models';
export type { Files } from './lib/routes';
export { routes, createRoutes } from './lib/routes';
export {
  defineRouteMeta,
  injectActivatedRoute,
  injectRouter,
} from './lib/define-route';
export { RouteMeta } from './lib/models';
export type { AnalogJsonLdDocument } from './lib/json-ld';
export { provideFileRouter, withExtraRoutes } from './lib/provide-file-router';
export { MetaTag } from './lib/meta-tags';
export { PageServerLoad, LoadResult } from './lib/route-types';
export { injectLoad } from './lib/inject-load';
export { getLoadResolver } from './lib/get-load-resolver';
export { requestContextInterceptor } from './lib/request-context';
export { injectRouteEndpointURL } from './lib/inject-route-endpoint-url';
export { FormAction } from './lib/form-action.directive';
export type { FormActionState } from './lib/form-action.directive';
export {
  issuesToFieldErrors,
  issuesToFormErrors,
  issuePathToFieldName,
} from './lib/validation-errors';
export type { ValidationFieldErrors } from './lib/validation-errors';
export { injectDebugRoutes } from './lib/debug/routes';
export { withDebugRoutes } from './lib/debug';
export { ServerOnly } from './lib/server.component';

// Typed file routes
export type {
  AnalogRouteTable,
  AnalogRoutePath,
  RoutePathOptions,
  RoutePathArgs,
  RoutePathOptionsBase,
  RouteParamsOutput,
  RouteQueryOutput,
} from './lib/route-path';
export { routePath } from './lib/route-path';
export { injectTypedRouter } from './lib/typed-router';
export type {
  GenerateRouteTreeDeclarationOptions,
  RouteParamInfo,
  RouteSchemaInfo,
  RouteEntry,
  RouteManifest,
} from './lib/route-manifest';
export {
  filenameToRouteId,
  filenameToRoutePath,
  extractRouteParams,
  generateRouteManifest,
  generateRouteTableDeclaration,
  generateRouteTreeDeclaration,
  detectSchemaExports,
  formatManifestSummary,
} from './lib/route-manifest';
export { RouteLinkPipe } from './lib/route-link.pipe';

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
export { injectTypedParams, injectTypedQuery } from './lib/inject-typed-params';
export { injectRouteContext } from './lib/inject-route-context';
