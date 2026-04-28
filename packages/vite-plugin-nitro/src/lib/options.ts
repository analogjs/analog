import type { PrerenderRoute } from 'nitro/types';
import type { UserConfig } from 'vite';

export interface I18nPrerenderOptions {
  /**
   * The default/source locale for the application.
   */
  defaultLocale: string;

  /**
   * List of supported locale identifiers.
   * Each route will be prerendered once per locale with a locale prefix.
   */
  locales: string[];
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
   * Vite-native build passthrough. Rolldown-only options such as
   * `build.rolldownOptions.output.codeSplitting` are forwarded when present.
   */
  vite?: {
    build?: UserConfig['build'];
  };
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

export type SitemapPriority = number | `${number}`;

export interface SitemapRouteDefinition {
  route: string;
  lastmod?: string;
  changefreq?:
    | 'always'
    | 'hourly'
    | 'daily'
    | 'weekly'
    | 'monthly'
    | 'yearly'
    | 'never';
  priority?: SitemapPriority;
}

export interface SitemapEntry extends SitemapRouteDefinition {
  loc: string;
}

export type SitemapRouteInput = string | SitemapRouteDefinition | undefined;
export type SitemapRouteSource =
  | SitemapRouteInput[]
  | (() => Promise<SitemapRouteInput[]>);
export type SitemapExcludeRule =
  | string
  | RegExp
  | ((entry: SitemapEntry) => boolean | Promise<boolean>);
export type SitemapTransform = (
  entry: SitemapEntry,
) => SitemapRouteDefinition | false | Promise<SitemapRouteDefinition | false>;

export interface SitemapConfig {
  host: string;
  include?: SitemapRouteSource;
  exclude?: SitemapExcludeRule[];
  defaults?: PrerenderSitemapConfig;
  transform?: SitemapTransform;
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

  /**
   * Recurse into subdirectories of `contentDir` when discovering files.
   * When enabled, the matching file's directory relative to `contentDir`
   * is exposed via `PrerenderContentFile.relativePath` so transforms can
   * disambiguate identically-named files across subdirectories.
   * @default false
   */
  recursive?: boolean;
}

/**
 * @param path the path to the content file
 * @param name the basename of the matching content file without the file extension
 * @param extension the file extension
 * @param attributes the frontmatter attributes extracted from the frontmatter section of the file
 * @param content the raw file content including frontmatter
 * @param relativePath when `recursive` is enabled, the directory of the file relative to `contentDir` (empty string for files at the top level)
 * @returns a string with the route should be returned (e. g. `/blog/<slug>`) or the value `false`, when the route should not be prerendered.
 */
export interface PrerenderContentFile {
  path: string;
  attributes: Record<string, any>;
  name: string;
  extension: string;
  content: string;
  relativePath?: string;
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
  priority?: SitemapPriority;
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
