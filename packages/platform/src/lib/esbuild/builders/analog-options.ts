import type { WithMarkedOptions } from '../../content/marked/index.js';
import type { WithPrismHighlighterOptions } from '../../content/prism/options.js';
import type { WithShikiHighlighterOptions } from '../../content/shiki/options.js';

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
  /** Options for the build-time marked setup, as on the Vite path. */
  markedOptions?: WithMarkedOptions;
  /** Options for the shiki highlighter (themes, langs, container). */
  shikiOptions?: WithShikiHighlighterOptions;
  /** Options for the prism highlighter (additional languages). */
  prismOptions?: WithPrismHighlighterOptions;
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
   * Additional directories relative to the workspace root whose
   * `routes` subdirectory is scanned for API routes.
   */
  additionalAPIDirs?: string[];
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
