/**
 * Analog-specific settings read from the `analog` section of the build
 * target's options and handed to the esbuild plugins. Everything else
 * in the options passes through to the Angular builder untouched.
 */
export interface AnalogBuilderOptions {
  /**
   * Build-time markdown highlighter. Defaults to 'shiki'.
   */
  highlighter?: 'shiki' | 'prism';
  /**
   * Emit mermaid code fences for client-side rendering.
   */
  mermaid?: boolean;
  /**
   * Additional directories relative to the workspace root to scan for
   * page routes.
   */
  additionalPagesDirs?: string[];
  /**
   * Additional directories relative to the workspace root to scan for
   * markdown content.
   */
  additionalContentDirs?: string[];
  /**
   * EXPERIMENTAL: patch @angular/core's @defer runtime in server
   * bundles so renderStream can flush blocks as they resolve.
   */
  streaming?: boolean;
  /**
   * Emit a sitemap.xml into the browser output after a prerendering
   * build, one entry per prerendered page.
   */
  sitemap?: { host: string };
}
