import { nitro } from './lib/vite-plugin-nitro.js';
export type {
  Options,
  SitemapConfig,
  PrerenderRouteConfig,
  PrerenderContentDir,
  PrerenderContentFile,
} from './lib/options.js';

declare module 'nitro/types' {
  interface NitroRouteConfig {
    ssr?: boolean;
  }

  interface NitroRouteRules {
    ssr?: boolean;
  }
}

export default nitro;
