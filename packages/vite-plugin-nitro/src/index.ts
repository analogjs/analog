import { nitro } from './lib/vite-plugin-nitro.js';
export {
  Options,
  SitemapConfig,
  PrerenderRouteConfig,
  PrerenderContentDir,
  PrerenderContentFile,
} from './lib/options.js';

declare module 'nitropack' {
  interface NitroRouteConfig {
    ssr?: boolean;
  }

  interface NitroRouteRules {
    ssr?: boolean;
  }
}

export default nitro;
