import type { PrerenderRoute } from 'nitro/types';

/**
 * Configuration for a single code-splitting group.
 *
 * Each group captures modules that match its `test` criterion and bundles them
 * into a chunk whose name is derived from the `name` field. When multiple groups
 * match the same module, the one with the highest `priority` wins.
 *
 * These fields map 1-to-1 to Rolldown's `CodeSplittingGroup` type so that
 * user-provided config can be forwarded without transformation.
 *
 * @see https://rolldown.rs/configuration/output-options#codesplitting-groups
 */
export interface CodeSplittingGroup {
  /**
   * Chunk name — either a static string or a function that receives the
   * module ID and returns a chunk name (or `null` to skip the module).
   */
  name: string | ((moduleId: string) => string | null);
  /**
   * Filter which modules this group captures. Accepts a string (substring
   * match), a RegExp, or a predicate function.
   */
  test?: string | RegExp | ((moduleId: string) => boolean);
  /** Higher-priority groups capture modules first.  @default 0 */
  priority?: number;
  /** Minimum byte size for the chunk to be emitted.  @default 0 */
  minSize?: number;
  /** If the chunk exceeds this size it is split further.  @default Infinity */
  maxSize?: number;
  /** Minimum number of entry chunks that must reference a module.  @default 1 */
  minShareCount?: number;
  /** Skip modules larger than this byte size.  @default Infinity */
  maxModuleSize?: number;
  /** Skip modules smaller than this byte size.  @default 0 */
  minModuleSize?: number;
  /**
   * When `true`, further sub-group modules by which entry chunks actually
   * import them, producing more granular chunks.
   * @default false
   */
  entriesAware?: boolean;
  /**
   * Byte-size threshold below which small `entriesAware` sub-groups are
   * merged back together to avoid tiny chunks.
   * @default 0
   */
  entriesAwareMergeThreshold?: number;
}

/**
 * Top-level code-splitting configuration forwarded to Rolldown's
 * `output.codeSplitting` option.
 *
 * Scalar fields act as **global fallbacks** — they apply to every group that
 * does not override the same field locally.
 *
 * Pass `false` (via the `Options.codeSplitting` field) to disable code
 * splitting entirely and inline all dynamic imports.
 *
 * @see https://rolldown.rs/configuration/output-options#codesplitting
 */
export interface CodeSplittingOptions {
  /** Manual chunk groups.  Evaluated in `priority` order. */
  groups?: CodeSplittingGroup[];
  /**
   * When `true`, each group also pulls in the transitive dependencies of
   * its captured modules.
   * @default true
   */
  includeDependenciesRecursively?: boolean;
  /** Global fallback for `CodeSplittingGroup.minSize`. */
  minSize?: number;
  /** Global fallback for `CodeSplittingGroup.maxSize`. */
  maxSize?: number;
  /** Global fallback for `CodeSplittingGroup.minModuleSize`. */
  minModuleSize?: number;
  /** Global fallback for `CodeSplittingGroup.maxModuleSize`. */
  maxModuleSize?: number;
  /** Global fallback for `CodeSplittingGroup.minShareCount`. */
  minShareCount?: number;
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
  index?: string;
  /**
   * Relative path to source files. Default is 'src'.
   */
  sourceRoot?: string;
  /**
   * Absolute path to workspace root. Default is 'process.cwd()'
   */
  workspaceRoot?: string;
  /**
   * Additional page paths to include
   */
  additionalPagesDirs?: string[];
  /**
   * Additional API paths to include
   */
  additionalAPIDirs?: string[];
  apiPrefix?: string;

  /**
   * Toggles internal API middleware.
   * If disabled, a proxy request is used to route /api
   * requests to / in the production server build.
   *
   * @deprecated
   * Use the src/server/routes/api folder
   * for API routes.
   */
  useAPIMiddleware?: boolean;
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

export interface SitemapConfig {
  host: string;
}

export interface PrerenderContentDir {
  /**
   * The directory where files should be grabbed from.
   * @example `/src/contents/blog`
   */
  contentDir: string;
  /**
   * Transform the matching content files path into a route.
   * The function is called for each matching content file within the specified contentDir.
   * @param file information of the matching file (`path`, `name`, `extension`, `attributes`, `content`)
   * @returns a string with the route should be returned (e. g. `/blog/<slug>`) or the value `false`, when the route should not be prerendered.
   */
  transform: (file: PrerenderContentFile) => string | false;

  /**
   * Customize the sitemap definition for the prerendered route
   *
   * https://www.sitemaps.org/protocol.html#xmlTagDefinitions
   */
  sitemap?:
    | PrerenderSitemapConfig
    | ((file: PrerenderContentFile) => PrerenderSitemapConfig);

  /**
   * Output the source markdown content alongside the prerendered route.
   * The source file will be accessible at the route path with a .md extension.
   * @param file information of the matching file including its content
   * @returns the markdown content string to output, or `false` to skip outputting for this file
   */
  outputSourceFile?: (file: PrerenderContentFile) => string | false;
}

/**
 * @param path the path to the content file
 * @param name the basename of the matching content file without the file extension
 * @param extension the file extension
 * @param attributes the frontmatter attributes extracted from the frontmatter section of the file
 * @param content the raw file content including frontmatter
 * @returns a string with the route should be returned (e. g. `/blog/<slug>`) or the value `false`, when the route should not be prerendered.
 */
export interface PrerenderContentFile {
  path: string;
  attributes: Record<string, any>;
  name: string;
  extension: string;
  content: string;
}

export interface PrerenderSitemapConfig {
  lastmod?: string;
  changefreq?:
    | 'always'
    | 'hourly'
    | 'daily'
    | 'weekly'
    | 'monthly'
    | 'yearly'
    | 'never';
  priority?: string;
}

export interface PrerenderRouteConfig {
  route: string;
  /**
   * Customize the sitemap definition for the prerendered route
   *
   * https://www.sitemaps.org/protocol.html#xmlTagDefinitions
   */
  sitemap?: PrerenderSitemapConfig | (() => PrerenderSitemapConfig);
  /**
   * Prerender static data for the prerendered route
   */
  staticData?: boolean;
  /**
   * Path to the source markdown file to output alongside the prerendered route.
   * The source file will be accessible at the route path with a .md extension.
   * @example 'src/content/overview.md'
   */
  outputSourceFile?: string;
}
