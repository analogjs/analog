import { nitro } from './lib/vite-plugin-nitro.js';
export {
  Options,
  SitemapConfig,
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

declare module 'nitropack' {
  interface NitroRouteConfig {
    ssr?: boolean;
  }

  interface NitroRouteRules {
    ssr?: boolean;
  }
}

export default nitro;
