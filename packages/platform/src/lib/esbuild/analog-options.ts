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
}
