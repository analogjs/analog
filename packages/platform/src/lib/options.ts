import type { PluginOptions } from '@analogjs/vite-plugin-angular';
import type { NitroConfig, PrerenderRoute } from 'nitro/types';
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
} from '@analogjs/vite-plugin-nitro';

import type { ContentPluginOptions } from './content-plugin.js';
import type { DebugOption } from './utils/debug.js';
import type { StylePipelineOptions } from './style-pipeline.js';

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
   * plugin. Set to `false` to disable the internal vite plugin (e.g. when
   * using an alternative compiler like `@oxc-angular/vite`).
   *
   * `vite.build` uses Vite's native config shape and is forwarded to the
   * internal Nitro/Vite build pipeline, while the remaining fields are passed
   * to `@analogjs/vite-plugin-angular`.
   *
   * When `false`, the following top-level options are ignored because they
   * are only forwarded to the internal Angular plugin: `jit`,
   * `disableTypeChecking`, `hmr`, `liveReload`, `inlineStylesExtension`,
   * `fileReplacements`, and `include`.
   *
   * Use this to configure the embedded Angular integration itself, not as the
   * primary home for Analog-owned experimental features.
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
   * Enables Angular's HMR during development/watch mode.
   *
   * Defaults to `true` for watch mode.
   */
  hmr?: boolean;
  /**
   * @deprecated Use `hmr` instead. Kept as a compatibility alias.
   */
  liveReload?: boolean;
  /**
   * Enable debug logging for specific scopes.
   *
   * - `true` → enables all `analog:*` scopes (platform + angular + nitro)
   * - `string[]` → enables listed namespaces
   * - `{ scopes?, mode? }` → object form with optional `mode: 'build' | 'dev'`
   *   to restrict output to a specific Vite command (omit for both)
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
   * Automatically discover route directories (pages, content, API) in
   * workspace libraries by scanning `libs/**` directories directly.
   *
   * Discovered directories are merged with any explicit
   * `additionalPagesDirs`, `additionalContentDirs`, and
   * `additionalAPIDirs` values.
   *
   * @default false
   */
  discoverRoutes?: boolean;
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
   * Experimental features. These APIs are subject to change.
   *
   * `@analogjs/platform` is the default rollout and orchestration surface for
   * Analog-owned experiments. These flags may delegate to dedicated feature
   * plugins or forward options into lower-level integrations while preserving
   * a single Analog-first authoring surface.
   */
  experimental?: {
    /**
     * Use Angular's experimental compilation API.
     *
     * This is forwarded to `@analogjs/vite-plugin-angular`'s
     * `experimental.useAngularCompilationAPI`.
     *
     * Also accepted at `vite.experimental.useAngularCompilationAPI`
     * for backwards compatibility.
     *
     * Has no effect when `vite` is set to `false`.
     */
    useAngularCompilationAPI?: boolean;

    /**
     * Enable typed route table generation for type-safe navigation.
     *
     * When enabled, `@analogjs/platform` generates a single route module
     * that augments `AnalogRouteTable` with typed params and query for each
     * file-based route. JSON-LD manifest generation is configured on the same
     * object so both codegen features share one generated file.
     *
     * - `true` — generates `src/routeTree.gen.ts` with `routeJsonLdManifest`
     * - `TypedRouterOptions` — customize output path or disable just the
     *   JSON-LD manifest piece
     *
     * Unlocks type-safe usage of:
     * - `routePath()` — build route link objects for `[routerLink]`
     * - `injectNavigate()` — typed navigation
     * - `injectParams(from)` — typed params signal
     * - `injectQuery(from)` — typed query signal
     *
     * Inspired by TanStack Router's `routeTree.gen.ts` codegen.
     */
    typedRouter?: boolean | TypedRouterOptions;

    /**
     * Experimental slot for community-maintained style-pipeline integrations.
     *
     * This keeps Analog's core surface intentionally narrow: community
     * packages can register Vite plugins through an Analog-first config shape
     * without requiring Analog itself to own design-token engines, library
     * target contracts, or framework-specific theming semantics.
     */
    stylePipeline?: StylePipelineOptions | false;
  };
}

export interface TypedRouterOptions {
  /**
   * Output path for the single generated route module,
   * relative to the app root.
   *
   * @default 'src/routeTree.gen.ts'
   */
  outFile?: string;
  /**
   * Include generated `routeJsonLdManifest` data in the generated route file.
   *
   * @default true
   */
  jsonLdManifest?: boolean;
  /**
   * Fail production builds after regenerating a stale checked-in route file.
   * Development and watch mode continue to update the file automatically.
   *
   * @default true
   */
  verifyOnBuild?: boolean;
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
