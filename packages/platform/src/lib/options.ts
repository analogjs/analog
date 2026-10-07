import type { PrerenderRoute } from 'nitro/types';
import type {
  SitemapConfig,
  SitemapEntry,
  SitemapExcludeRule,
  SitemapPriority,
  SitemapRouteDefinition,
  SitemapRouteInput,
  SitemapRouteSource,
  SitemapTransform,
  PrerenderContentDir,
  PrerenderContentFile,
  PrerenderSitemapConfig,
  PrerenderRouteConfig,
} from './nitro/types.js';

import type { ContentPluginOptions } from './content-plugin.js';
import type { DebugOption } from './utils/debug.js';

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
  /**
   * Prerender the static pages without producing the server output.
   */
  static?: boolean;
  prerender?: PrerenderOptions;
  entryServer?: string;
  apiPrefix?: string;
  index?: string;
  workspaceRoot?: string;
  content?: ContentPluginOptions;
  /**
   * Enable debug logging for the `analog:platform:*` and `analog:nitro:*`
   * scopes.
   *
   * - `true` → enables all platform + nitro scopes
   * - `string[]` → enables listed namespaces
   * - `{ scopes?, mode? }` → object form with optional `mode: 'build' | 'dev'`
   *   to restrict output to a specific Vite command (omit for both)
   *
   * Angular scopes (`analog:angular:*`) are owned by
   * `@analogjs/vite-plugin-angular` — pass `debug` to `angular()` directly
   * to enable them.
   *
   * Also responds to the `DEBUG` env var (Node.js) or `localStorage.debug`
   * (browser), using the `obug` convention.
   */
  debug?: DebugOption;

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
   * Generate routes from the app's route directories.
   *
   * Workspace library route directories are opt-in. Use
   * `discoverLibraryRoutes()` and pass its result to `additionalPagesDirs`,
   * `additionalContentDirs`, and `additionalAPIDirs` when an app should
   * include routes from shared libraries.
   *
   * @default false
   */
  discoverRoutes?: boolean;
  /**
   * Configuration for runtime i18n support.
   * When set, enables locale detection on SSR and provides
   * the LOCALE injection token.
   */
  i18n?: I18nOptions;
  /** Opt-in experimental features. */
  experimental?: {
    /** Generate route declarations and enable typed navigation helpers. */
    typedRouting?:
      | boolean
      | import('./typed-routes-plugin.js').TypedRoutingOptions;
  };
}

export type {
  PrerenderContentDir,
  PrerenderContentFile,
  PrerenderSitemapConfig,
  SitemapConfig,
  SitemapEntry,
  SitemapExcludeRule,
  SitemapPriority,
  SitemapRouteDefinition,
  SitemapRouteInput,
  SitemapRouteSource,
  SitemapTransform,
};
