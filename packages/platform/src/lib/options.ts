import type { PluginOptions } from '@analogjs/vite-plugin-angular';
import type { NitroConfig, PrerenderRoute } from 'nitropack';
import type {
  SitemapConfig,
  PrerenderContentDir,
  PrerenderContentFile,
  PrerenderRouteConfig,
} from '@analogjs/vite-plugin-nitro';

import { ContentPluginOptions } from './content-plugin.js';

declare module 'nitropack' {
  interface NitroRouteConfig {
    ssr?: boolean;
  }

  interface NitroRouteRules {
    ssr?: boolean;
  }
}

export interface PrerenderOptions {
  /**
   * Add additional routes to prerender through crawling page links.
   */
  discover?: boolean;

  /**
   * List of routes to prerender resolved statically or dynamically.
   */
  routes?:
    | (string | PrerenderContentDir | PrerenderRouteConfig)[]
    | (() => Promise<
        (string | PrerenderContentDir | PrerenderRouteConfig | undefined)[]
      >);
  sitemap?: SitemapConfig;
  /** List of functions that run for each route after pre-rendering is complete. */
  postRenderingHooks?: ((routes: PrerenderRoute) => Promise<void>)[];
}

export interface Options {
  ssr?: boolean;
  ssrBuildDir?: string;
  /**
   * Prerender the static pages without producing the server output.
   */
  static?: boolean;
  prerender?: PrerenderOptions;
  entryServer?: string;
  vite?: PluginOptions;
  nitro?: NitroConfig;
  apiPrefix?: string;
  jit?: boolean;
  index?: string;
  workspaceRoot?: string;
  content?: ContentPluginOptions;

  /**
   * Enables Angular's HMR during development
   */
  liveReload?: boolean;

  /**
   * Additional page paths to include
   */
  additionalPagesDirs?: string[];
  /**
   * Additional page paths to include
   */
  additionalContentDirs?: string[];
  /**
   * Additional API paths to include
   */
  additionalAPIDirs?: string[];
  /**
   * Additional files to include in compilation
   */
  include?: string[];
  /**
   * Toggles internal API middleware.
   * If disabled, a proxy request is used to route /api
   * requests to / in the production server build.
   */
  useAPIMiddleware?: boolean;
  /**
   * Disable type checking diagnostics by the Angular compiler
   */
  disableTypeChecking?: boolean;
}

export { PrerenderContentDir, PrerenderContentFile };
