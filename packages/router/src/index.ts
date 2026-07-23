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
// Server Functions (issue #2422) — client transport + shared type surface.
export {
  injectServerFn,
  injectServerFnMutation,
  provideServerFnClient,
  ServerFnClient,
} from './lib/server-fn/inject-server-fn';
export {
  createServerFnRef,
  type ServerFnRefConfig,
} from './lib/server-fn/server-fn-ref';
export {
  SERVER_FN_DISPATCHER,
  type ServerFnDispatcher,
} from './lib/server-fn/dispatcher';
export type {
  ServerFn,
  ServerFnConfig,
  ServerFnContext,
  ServerFnDef,
  ServerFnHandler,
  ServerFnMethod,
  StandardSchemaV1,
} from './lib/server-fn/types';
