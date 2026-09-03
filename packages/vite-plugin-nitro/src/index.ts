import { nitro } from './lib/vite-plugin-nitro.js';
export { debugInstances } from './lib/utils/debug.js';
export { nitro } from './lib/vite-plugin-nitro.js';
export type {
  Options,
  SitemapConfig,
  SitemapEntry,
  SitemapExcludeRule,
  SitemapPriority,
  SitemapRouteDefinition,
  SitemapRouteInput,
  SitemapRouteSource,
  SitemapTransform,
  PrerenderSitemapConfig,
  PrerenderRouteConfig,
  PrerenderContentDir,
  PrerenderContentFile,
  I18nPrerenderOptions,
} from './lib/options.js';

// Server-function id derivation, shared with @analogjs/platform's client scrub
// so both sides compute identical opaque ids (single source of truth).
export {
  deriveServerFnId,
  serverFnFileId,
} from './lib/utils/derive-server-fn-id.js';
export {
  injectServerFnIds,
  type InjectServerFnIdsResult,
} from './lib/utils/inject-server-fn-ids.js';

// Nitro's NitroRouteConfig and NitroRouteRules are aliases of h3's route rule
// types, so custom rule names are declared on h3 as its docs describe.
declare module 'h3/rules' {
  interface RouteRuleConfig {
    ssr?: boolean;
    /**
     * Disable progressive streaming SSR for matching routes (falls back to a
     * buffered render). Only meaningful when `experimental.streaming` is on.
     */
    streaming?: boolean;
  }

  interface RouteRules {
    ssr?: boolean;
    streaming?: boolean;
  }
}

export default nitro;
