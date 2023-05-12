import type { PluginOptions } from '@analogjs/vite-plugin-angular';
import { NitroConfig } from 'nitropack';

export interface PrerenderOptions {
  /**
   * Add additional routes to prerender through crawling page links.
   */
  discover?: boolean;

  /**
   * List of routes to prerender resolved statically or dynamically.
   */
  routes?: string[] | (() => Promise<(string | undefined)[]>);
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
}
