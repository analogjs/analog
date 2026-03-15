import type { PluginOptions } from '@analogjs/vite-plugin-angular';
import type { NitroConfig, PrerenderRoute } from 'nitro/types';
import type {
  SitemapConfig,
  PrerenderContentDir,
  PrerenderContentFile,
  PrerenderRouteConfig,
  CodeSplittingGroup,
  CodeSplittingOptions,
} from '@analogjs/vite-plugin-nitro';

import { ContentPluginOptions } from './content-plugin.js';

declare module 'nitro/types' {
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

// Re-export code-splitting types so consumers of @analogjs/platform can
// import them without taking a direct dependency on @analogjs/vite-plugin-nitro.
// The canonical definitions live in vite-plugin-nitro/src/lib/options.ts.
export type { CodeSplittingGroup, CodeSplittingOptions };

export interface Options {
  ssr?: boolean;
  ssrBuildDir?: string;
  /**
   * Prerender the static pages without producing the server output.
   */
  static?: boolean;
  prerender?: PrerenderOptions;
  entryServer?: string;
  /**
   * Pass configuration options to the internal `@analogjs/vite-plugin-angular`
   * plugin. Set to false to disable the internal vite plugin.
   */
  vite?: PluginOptions | false;
  nitro?: NitroConfig;
  apiPrefix?: string;
  jit?: boolean;
  index?: string;
  workspaceRoot?: string;
  content?: ContentPluginOptions;
  /**
   * Extension applied for inline styles
   */
  inlineStylesExtension?: string;
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
  /**
   * File replacements
   */
  fileReplacements?: PluginOptions['fileReplacements'];
  /**
   * Code splitting configuration forwarded to Rolldown (Vite 8+).
   *
   * - `false`  — disable code splitting; all dynamic imports are inlined.
   * - object   — fine-grained chunk grouping via {@link CodeSplittingOptions}.
   *
   * Ignored when the bundler is Rollup (Vite ≤ 7).
   */
  codeSplitting?: false | CodeSplittingOptions;
}

export { PrerenderContentDir, PrerenderContentFile };
