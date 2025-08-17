import type { Plugin } from 'vite';
import { resolve } from 'path';
import { existsSync } from 'fs';

export interface JsonLdSSRPluginOptions {
  /** Path to the generated route tree file (relative to project root) */
  routeTreePath?: string;
  /** The workspace root directory */
  workspaceRoot?: string;
  /** Enable verbose logging for debugging */
  debugVerbose?: boolean;
}

/**
 * # AnalogJS JSON-LD SSR Plugin
 *
 * A sophisticated Vite plugin that automatically injects JSON-LD structured data into HTML during server-side rendering (SSR).
 * This plugin seamlessly integrates with AnalogJS's route tree system to provide SEO-optimized structured data for each route.
 *
 * ## Core Functionality
 *
 * 1. **Route Tree Integration**: Automatically loads and monitors the generated `routeTree.gen.ts` file
 * 2. **Dynamic JSON-LD Injection**: Injects route-specific JSON-LD scripts into HTML `<head>` during SSR
 * 3. **Intelligent Route Matching**: Handles complex route patterns and path normalization
 * 4. **Auto-Recovery**: Automatically triggers route tree generation when needed
 *
 * ## How It Works
 *
 * The plugin intercepts HTTP responses during SSR and:
 * - Loads the route tree file containing `routeJsonLdMap` exports from page components
 * - Matches the current route against available JSON-LD data
 * - Injects appropriate `<script type="application/ld+json">` tags before `</head>`
 *
 * ## Critical Implementation Details
 *
 * ### SSR Module Loading Strategy
 * - Uses `viteServer.ssrLoadModule()` instead of Node.js `require()` for TypeScript compatibility
 * - Implements retry logic with module invalidation for Vite compilation timing issues
 * - Includes automatic route tree generation trigger when empty exports are detected
 *
 * ### Route Path Resolution
 * - Stores original route paths during middleware traversal to handle Angular SSR's `/index.html` responses
 * - Normalizes paths by removing trailing slashes and handling query parameters
 * - Supports complex routing patterns including parameterized and nested routes
 *
 * ## Known Pitfalls & Solutions
 *
 * ### 1. **Vite SSR Compilation Timing**
 * **Problem**: `ssrLoadModule()` may return empty exports on first load due to TypeScript compilation timing
 * **Solution**: Retry logic with module graph invalidation and delay
 *
 * ### 2. **Route Tree Generation Race Conditions**
 * **Problem**: JSON-LD plugin may load before route tree is generated during dev startup
 * **Solution**: Automatic route tree generation trigger by touching page files
 *
 * ### 3. **Angular SSR Route Context Loss**
 * **Problem**: Angular responds to `/route` with `/index.html`, losing original route context
 * **Solution**: Route tracking middleware that stores original paths for later matching
 *
 * ### 4. **Static Asset Interference**
 * **Problem**: Plugin processing static files unnecessarily affects performance
 * **Solution**: Comprehensive static asset filtering in middleware
 *
 * ## Performance Optimizations
 *
 * - **Lazy Loading**: Route tree is loaded only once and cached
 * - **Plugin Disabling**: Automatically disables after errors to prevent performance degradation
 * - **Static Asset Skipping**: Early exit for non-HTML requests
 * - **Memory Efficiency**: Reuses route tree map across requests
 *
 * ## Future Enhancement Opportunities
 *
 * ### 1. **Advanced Caching**
 * - Implement intelligent cache invalidation based on file modification times
 * - Add memory-efficient LRU cache for large route trees
 * - Support for distributed caching in multi-instance deployments
 *
 * ### 2. **Enhanced Route Matching**
 * - Support for wildcard and regex route patterns
 * - Dynamic parameter interpolation in JSON-LD data
 * - Locale-aware JSON-LD injection for i18n applications
 *
 * ### 3. **Developer Experience**
 * - Visual debugging interface for JSON-LD injection
 * - Build-time validation of JSON-LD schema compliance
 * - Hot-reload support for JSON-LD changes during development
 *
 * ### 4. **Production Optimizations**
 * - Pre-compilation of JSON-LD data during build
 * - Compression and minification of injected scripts
 * - CDN-friendly JSON-LD asset generation
 *
 * ### 5. **Framework Integration**
 * - Support for multiple Angular apps in monorepo setups
 * - Integration with popular CMS and headless architectures
 * - Compatibility with other meta-framework patterns
 *
 * ## Usage Example
 *
 * ```typescript
 * // vite.config.ts
 * import { jsonLdSSRPlugin } from '@analogjs/vite-plugin-angular';
 *
 * export default defineConfig({
 *   plugins: [
 *     jsonLdSSRPlugin({
 *       routeTreePath: 'src/app/routeTree.gen.ts',
 *       workspaceRoot: process.cwd()
 *     })
 *   ]
 * });
 *
 * // page component with JSON-LD
 * export const routeJsonLd = {
 *   "@context": "https://schema.org",
 *   "@type": "Article",
 *   "headline": "My Article"
 * };
 * ```
 *
 * @param options Configuration options for the JSON-LD SSR plugin
 * @returns Configured Vite plugin instance
 *
 * @see {@link https://analogjs.org/docs/features/routing/metadata#json-ld} AnalogJS JSON-LD Documentation
 * @see {@link https://developers.google.com/search/docs/appearance/structured-data} Google Structured Data Guide
 * @see {@link https://schema.org/} Schema.org Vocabulary Reference
 */
export function jsonLdSSRPlugin(options: JsonLdSSRPluginOptions = {}): Plugin {
  const routeTreePath = options.routeTreePath ?? 'src/app/routeTree.gen.ts';
  const debugVerbose = options.debugVerbose ?? false;
  let routeJsonLdMap: Map<string, unknown> | null = null;
  let projectRoot: string;
  let pluginDisabled = false;

  // Helper functions for conditional logging
  const log = (message: string, ...args: any[]) => {
    if (debugVerbose) {
      console.log(`[analog-json-ld-ssr] ${message}`, ...args);
    }
  };

  const errorLog = (message: string, ...args: any[]) => {
    // Always log errors regardless of verbose settings
    console.error(`[analog-json-ld-ssr-ERROR] ${message}`, ...args);
  };

  log('Plugin initialized');

  return {
    name: 'analog-json-ld-ssr',
    enforce: 'post',

    configResolved(config) {
      projectRoot = config.root;
      log('configResolved - projectRoot:', projectRoot);
    },

    configureServer(server) {
      log('configureServer called - setting up middleware');

      // Store the Vite dev server for SSR module loading
      const viteServer = server;

      // Hook into the middleware to inject JSON-LD
      // Use 'pre' order to ensure this runs before other middleware
      server.middlewares.use(async (req, res, next) => {
        log('Middleware called for URL:', req.url);

        /**
         * ROUTE TRACKING MECHANISM
         *
         * Angular SSR has a unique behavior where route requests (e.g., `/event`) are internally
         * processed and responded to as `/index.html`. This creates a challenge for the JSON-LD
         * plugin because by the time we intercept the HTML response, we've lost the original
         * route context needed for JSON-LD matching.
         *
         * SOLUTION: Store the original route path in the request object during the initial
         * middleware traversal, then retrieve it later during HTML processing to ensure
         * accurate route-to-JSON-LD mapping.
         *
         * This approach handles:
         * - Direct route navigation: `/event` -> stores `/event`
         * - Parameterized routes: `/product/123` -> stores `/product/123`
         * - Query parameters: `/search?q=term` -> stores `/search`
         * - Nested routes: `/category/subcategory` -> stores `/category/subcategory`
         */
        if (
          req.url &&
          !req.url.includes('index.html') &&
          !req.url.includes('.') &&
          !req.url.startsWith('/api/')
        ) {
          (req as any).__analogOriginalRoute = req.url.split('?')[0];
          log('Stored original route:', (req as any).__analogOriginalRoute);
        }

        // Skip processing for static assets and API routes
        if (req.url?.includes('.') || req.url?.startsWith('/api/')) {
          log('Skipping static/API route:', req.url);
          return next();
        }

        // Store the original end method
        const originalEnd = res.end;

        // Override the end method to inject JSON-LD
        (res as any).end = async function (chunk?: any, encoding?: any) {
          log('res.end called for URL:', req.url);

          // Check if this is an HTML response
          const contentType = res.getHeader('content-type');
          log('Content-Type:', contentType);

          if (contentType?.toString().includes('text/html')) {
            let html = '';
            if (chunk) {
              html = typeof chunk === 'string' ? chunk : chunk.toString();
            }

            log('HTML chunk length:', html.length);
            log('Contains </head>:', html?.includes('</head>'));
            log('Plugin disabled:', pluginDisabled);

            // Only process if it contains HTML structure and we haven't disabled the plugin
            if (html?.includes('</head>') && !pluginDisabled) {
              // Load route JSON-LD map if not already loaded
              if (!routeJsonLdMap) {
                try {
                  const routeTreeFullPath = resolve(projectRoot, routeTreePath);
                  log('Route tree path:', routeTreeFullPath);
                  log('File exists:', existsSync(routeTreeFullPath));

                  if (existsSync(routeTreeFullPath)) {
                    // RACE CONDITION FIX: Clear Vite's module cache first
                    // This ensures we get fresh content even if the file was written after initial load
                    try {
                      const moduleGraph =
                        viteServer.environments?.ssr?.moduleGraph ||
                        viteServer.moduleGraph;
                      const module =
                        moduleGraph?.getModuleById(routeTreeFullPath);
                      if (module) {
                        log('Invalidating cached module');
                        moduleGraph.invalidateModule(module);
                      }
                    } catch (cacheError) {
                      log('Could not clear module cache:', cacheError);
                    }

                    // Use Vite's SSR module loading instead of Node.js require()
                    try {
                      log(
                        'Attempting to load route tree via Vite SSR:',
                        routeTreeFullPath,
                      );

                      // Check if file is empty or corrupted
                      const fs = await import('node:fs');
                      const fileContent = fs.readFileSync(
                        routeTreeFullPath,
                        'utf-8',
                      );
                      log('Route tree file size:', fileContent.length);
                      log(
                        'File contains routeJsonLdMap:',
                        fileContent.includes('routeJsonLdMap'),
                      );

                      // Use Vite's SSR module loading for proper TypeScript/ESM support
                      let routeTree =
                        await viteServer.ssrLoadModule(routeTreeFullPath);
                      log(
                        'First SSR load attempt - exports:',
                        Object.keys(routeTree),
                      );

                      /**
                       * CRITICAL AUTO-RECOVERY MECHANISM
                       *
                       * This logic handles a complex race condition where the JSON-LD plugin loads
                       * before the route tree plugin has generated the route tree file during dev startup.
                       *
                       * PROBLEM: The route tree plugin uses conditional file writing that skips writing
                       * during dev server startup to avoid SSR conflicts. However, the JSON-LD plugin
                       * expects the route tree to exist and be compilable by Vite's SSR loader.
                       *
                       * SOLUTION: Auto-trigger route tree generation by "touching" a page file, which
                       * activates the route tree plugin's handleHotUpdate hook to generate the file.
                       *
                       * This elegant solution maintains the conditional writing benefits while ensuring
                       * the JSON-LD plugin can function correctly on first load.
                       */
                      if (Object.keys(routeTree).length === 0) {
                        log(
                          'Empty exports detected, triggering route tree generation',
                        );

                        // Force route tree generation by touching a known page file to trigger hot reload
                        try {
                          const path = await import('node:path');
                          const fs = await import('node:fs');

                          // Look for known page files that should exist
                          const knownPageFiles = [
                            'src/app/pages/event.page.ts',
                            'src/app/pages/(home).page.ts',
                            'src/app/pages/article.page.ts',
                          ];

                          let pageFileToTouch = null;
                          for (const relativePageFile of knownPageFiles) {
                            const fullPagePath = path.resolve(
                              projectRoot,
                              relativePageFile,
                            );
                            if (fs.existsSync(fullPagePath)) {
                              pageFileToTouch = fullPagePath;
                              break;
                            }
                          }

                          if (pageFileToTouch) {
                            log(
                              'Triggering hot reload by touching:',
                              pageFileToTouch,
                            );

                            // Touch the file to trigger route tree generation via hot reload
                            const now = new Date();
                            fs.utimesSync(pageFileToTouch, now, now);

                            // Wait for route tree generation to complete
                            await new Promise((resolve) =>
                              setTimeout(resolve, 1000),
                            );

                            // Clear module cache and try loading again
                            const moduleGraph =
                              viteServer.environments?.ssr?.moduleGraph ||
                              viteServer.moduleGraph;
                            const module =
                              moduleGraph?.getModuleById(routeTreeFullPath);
                            if (module) {
                              moduleGraph.invalidateModule(module);
                            }

                            // Try loading again
                            routeTree =
                              await viteServer.ssrLoadModule(routeTreeFullPath);
                            log(
                              'After route tree generation - exports:',
                              Object.keys(routeTree),
                            );
                          } else {
                            log(
                              'No known page files found to trigger route tree generation',
                            );
                          }
                        } catch (generationError) {
                          log('Route tree generation failed:', generationError);
                        }
                      }

                      log('Final route tree exports:', Object.keys(routeTree));
                      log(
                        'routeJsonLdMap exists in module:',
                        'routeJsonLdMap' in routeTree,
                      );

                      routeJsonLdMap = routeTree.routeJsonLdMap || new Map();
                      log(
                        'Loaded routeJsonLdMap with size:',
                        routeJsonLdMap?.size,
                      );
                      log(
                        'routeJsonLdMap entries:',
                        Array.from(routeJsonLdMap?.entries() || []),
                      );

                      // If the map is empty, disable the plugin for future requests
                      if (routeJsonLdMap?.size === 0) {
                        log('Empty routeJsonLdMap, disabling plugin');
                        pluginDisabled = true;
                      }
                    } catch (ssrLoadError) {
                      log(
                        'Failed to load route tree via Vite SSR:',
                        ssrLoadError,
                      );
                      // If SSR loading fails, initialize with empty map and disable
                      routeJsonLdMap = new Map();
                      pluginDisabled = true;
                    }
                  } else {
                    log('Route tree file does not exist:', routeTreeFullPath);
                    routeJsonLdMap = new Map();
                    pluginDisabled = true;
                  }
                } catch (error) {
                  log('Error in route tree loading logic:', error);
                  // Route tree might not exist or might not have routeJsonLdMap export
                  // Silently fallback to empty map to avoid disrupting SSR
                  routeJsonLdMap = new Map();
                  pluginDisabled = true;
                }
              }

              // Get the current path with proper normalization
              // Use the stored original route if available, otherwise use current URL
              let path =
                (req as any).__analogOriginalRoute ||
                req.url?.split('?')[0] ||
                '/';

              // Remove trailing slash except for root
              if (path !== '/' && path.endsWith('/')) {
                path = path.slice(0, -1);
              }

              // Handle index.html requests by converting to the actual route
              if (path.endsWith('/index.html')) {
                path = path.replace('/index.html', '') || '/';
              }

              log('Original URL:', req.url);
              log('Stored original route:', (req as any).__analogOriginalRoute);
              log('Normalized path:', path);
              log('routeJsonLdMap size:', routeJsonLdMap?.size);
              log(
                'routeJsonLdMap keys:',
                Array.from(routeJsonLdMap?.keys() || []),
              );

              // Get JSON-LD for this route
              const jsonLd = routeJsonLdMap?.get(path);
              log('Found JSON-LD for path:', path, ':', !!jsonLd);

              if (jsonLd) {
                // Create the JSON-LD script tag
                const jsonLdScript = `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>`;

                // Inject before closing head tag
                html = html.replace('</head>', `${jsonLdScript}\n</head>`);
                chunk = html;
              }
            }
          }

          // Call the original end method
          return originalEnd.call(this, chunk, encoding);
        };

        next();
      });
    },

    transformIndexHtml: {
      order: 'post',
      async handler(html, ctx) {
        // Skip if plugin is disabled
        if (pluginDisabled) {
          return html;
        }

        // Only process during SSR
        if (!ctx.server) {
          return html;
        }

        // During build, we need to handle it differently
        if (ctx.bundle) {
          // For build time, we'll inject a placeholder that can be replaced
          // by the SSR renderer
          return html.replace(
            '</head>',
            '<!--analog-json-ld-placeholder-->\n</head>',
          );
        }

        return html;
      },
    },
  };
}
