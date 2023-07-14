import { PrerenderRoute } from 'nitropack';

export interface Options {
  ssr?: boolean;
  ssrBuildDir?: string;
  /**
   * Prerender the static pages without producing the server output.
   */
  static?: boolean;
  prerender?: PrerenderOptions;
  entryServer?: string;
}

export interface PrerenderOptions {
  /**
   * Add additional routes to prerender through crawling page links.
   */
  discover?: boolean;

  /**
   * List of routes to prerender resolved statically or dynamically.
   */
  routes?: string[] | (() => Promise<(string | undefined)[]>);
  sitemap?: SitemapConfig;
  /** List of functions that will run after pre-rendering is complete. */
  postRenderingHooks?: ((routes: PrerenderRoute) => Promise<boolean>)[];
}

export interface SitemapConfig {
  host: string;
}
