export type { Files } from './lib/routes';
export type { RouteExport } from './lib/models';

export { routes, createRoutes } from './lib/routes';
export {
  defineRouteMeta,
  injectActivatedRoute,
  injectRouter,
} from './lib/define-route';
export { RouteMeta } from './lib/models';
export { provideFileRouter } from './lib/provide-file-router';
export { MetaTag, updateMetaTagsOnRouteChange } from './lib/meta-tags';
export { PageServerLoad, LoadResult } from './lib/route-types';
export { injectLoad } from './lib/inject-load';
