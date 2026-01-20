export type { RouteExport } from './lib/models';
export type { Files } from './lib/routes';
export { routes, createRoutes } from './lib/routes';
export {
  defineRouteMeta,
  injectActivatedRoute,
  injectRouter,
} from './lib/define-route';
export { RouteMeta } from './lib/models';
export { provideFileRouter, withExtraRoutes } from './lib/provide-file-router';
export { MetaTag } from './lib/meta-tags';
export { PageServerLoad, LoadResult } from './lib/route-types';
export { injectLoad } from './lib/inject-load';
export { getLoadResolver } from './lib/get-load-resolver';
export { requestContextInterceptor } from './lib/request-context';
export { injectRouteEndpointURL } from './lib/inject-route-endpoint-url';
export { FormAction } from './lib/form-action.directive';
export { injectDebugRoutes } from './lib/debug/routes';
export { withDebugRoutes } from './lib/debug';
export { ServerOnly } from './lib/server.component';

// Type-safe routing
export { route, TypedRoute } from './lib/route-builder';
export { navigate, navigateByUrl } from './lib/typed-navigation';
export {
  injectParams,
  TypedParams,
  TypeConstructor,
  InferConstructor,
  ParamSchema,
  SchemaLike,
  InferSchemaOutput,
  InferredParams,
  ResolvedRouteParams,
  DynamicRoutes,
  GetRouteParams,
  ApplySchema,
  InjectParamsReturn,
} from './lib/inject-params';
