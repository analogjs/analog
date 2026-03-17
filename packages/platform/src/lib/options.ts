import type { PluginOptions } from '@analogjs/vite-plugin-angular';
import type { NitroConfig, PrerenderRoute } from 'nitro/types';
import type {
  SitemapConfig,
  PrerenderContentDir,
  PrerenderContentFile,
  PrerenderRouteConfig,
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
   * When `false`, the following top-level options are ignored because they
   * are only forwarded to the internal Angular plugin: `jit`,
   * `disableTypeChecking`, `liveReload`, `inlineStylesExtension`,
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
     * When enabled, `@analogjs/platform` wires up the dedicated
     * `@analogjs/vite-plugin-routes` plugin to generate a route declarations
     * file that augments `AnalogRouteTable` with typed params and query for
     * each file-based route. JSON-LD manifest generation is configured on the
     * same object so both codegen features can share a single output file.
     *
     * - `true` — generates `src/routeTree.gen.ts` with `routeJsonLdManifest`
     * - `TypedRouterOptions` — customize output path or disable just the
     *   JSON-LD manifest piece
     *
     * Unlocks type-safe usage of:
     * - `injectTypedRouter()` — navigate with autocomplete
     * - `routePath()` — build URLs with typed params
     * - `injectTypedParams(from)` — typed params signal
     * - `injectTypedQuery(from)` — typed query signal
     * - `RouteLinkPipe` — typed route links in templates
     *
     * Inspired by TanStack Router's `routeTree.gen.ts` codegen.
     */
    typedRouter?: boolean | TypedRouterOptions;
  };
}

export interface TypedRouterOptions {
  /**
   * Output path for the generated route declarations file,
   * relative to the app root.
   *
   * @default 'src/routeTree.gen.ts'
   */
  outFile?: string;
  /**
   * Include generated `routeJsonLdManifest` data in the generated routes file.
   *
   * @default true
   */
  jsonLdManifest?: boolean;
}

export { PrerenderContentDir, PrerenderContentFile };
