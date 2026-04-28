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

export interface I18nOptions {
  /**
   * The default/source locale for the application.
   */
  defaultLocale: string;

  /**
   * List of supported locale identifiers (e.g. ['en', 'fr', 'de']).
   */
  locales: string[];

  /**
   * Extract i18n messages from the build output.
   * When enabled, writes a translation source file after the client build.
   */
  extract?: {
    /**
     * Output format for extracted messages.
     * @default 'json'
     */
    format?: 'json' | 'xliff' | 'xliff2' | 'xmb';

    /**
     * Output file path for extracted messages, relative to project root.
     * @default 'src/i18n/messages.{format extension}'
     */
    outFile?: string;
  };
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
   * Opt into the fast compile path. Skips Angular's template type-checking
   * and routes compilation through an internal single-pass transform.
   */
  fastCompile?: boolean;
  /**
   * Compilation output mode used when `fastCompile` is enabled.
   * - `'full'` (default): Emit final Ivy definitions for application builds.
   * - `'partial'`: Emit partial declarations for library publishing.
   */
  fastCompileMode?: 'full' | 'partial';
  /**
   * File replacements
   */
  fileReplacements?: PluginOptions['fileReplacements'];
  /**
   * Configuration for runtime i18n support.
   * When set, enables locale detection on SSR and provides
   * the LOCALE injection token.
   */
  i18n?: I18nOptions;
}

export { PrerenderContentDir, PrerenderContentFile };
