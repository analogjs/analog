import { platformPlugin } from './lib/platform-plugin.js';

export type {
  Options,
  PrerenderSitemapConfig,
  PrerenderContentFile,
  SitemapConfig,
  SitemapEntry,
  SitemapExcludeRule,
  SitemapPriority,
  SitemapRouteDefinition,
  SitemapRouteInput,
  SitemapRouteSource,
  SitemapTransform,
} from './lib/options.js';
export { discoverLibraryRoutes } from './lib/discover-library-routes.js';
export type { DiscoveredLibraryRoutes } from './lib/discover-library-routes.js';
export default platformPlugin;
