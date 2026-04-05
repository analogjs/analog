import { createAnalogNitroPlugins } from './lib/analog-vite-plugin.js';

export { createAnalogNitroPlugins } from './lib/analog-vite-plugin.js';
export { analogNitroModule } from './lib/analog-nitro-module.js';
export { buildNitroConfig } from './lib/nitro-config-factory.js';
export { debugInstances } from './lib/utils/debug.js';
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
} from './lib/options.js';

declare module 'nitro/types' {
  interface NitroRouteConfig {
    ssr?: boolean;
  }

  interface NitroRouteRules {
    ssr?: boolean;
  }
}

export default createAnalogNitroPlugins;
