import type { Plugin } from 'vite';
import { resolve } from 'path';
import { existsSync } from 'fs';

export interface JsonLdSSRPluginOptions {
  /** Path to the generated route tree file (relative to project root) */
  routeTreePath?: string;
  /** The workspace root directory */
  workspaceRoot?: string;
}

/**
 * Vite plugin to inject JSON-LD during SSR
 * This plugin hooks into the SSR rendering process to inject JSON-LD
 * structured data based on the current route
 */
export function jsonLdSSRPlugin(options: JsonLdSSRPluginOptions = {}): Plugin {
  const routeTreePath = options.routeTreePath ?? 'src/app/routeTree.gen.ts';
  let routeJsonLdMap: Map<string, unknown> | null = null;
  let projectRoot: string;
  let pluginDisabled = false;

  console.log('[analog-json-ld-ssr-DEBUG] Plugin initialized');

  return {
    name: 'analog-json-ld-ssr',
    enforce: 'post',

    configResolved(config) {
      projectRoot = config.root;
      console.log(
        '[analog-json-ld-ssr-DEBUG] configResolved - projectRoot:',
        projectRoot,
      );
    },

    configureServer(server) {
      console.log(
        '[analog-json-ld-ssr-DEBUG] configureServer called - setting up middleware',
      );
      // Hook into the middleware to inject JSON-LD
      // Use 'pre' order to ensure this runs before other middleware
      server.middlewares.use((req, res, next) => {
        // Skip processing for static assets and API routes
        if (req.url?.includes('.') || req.url?.startsWith('/api/')) {
          return next();
        }

        // Store the original end method
        const originalEnd = res.end;

        // Override the end method to inject JSON-LD
        (res as any).end = function (chunk?: any, encoding?: any) {
          // Check if this is an HTML response
          const contentType = res.getHeader('content-type');
          if (contentType?.toString().includes('text/html')) {
            let html = '';
            if (chunk) {
              html = typeof chunk === 'string' ? chunk : chunk.toString();
            }

            // Only process if it contains HTML structure and we haven't disabled the plugin
            if (html?.includes('</head>') && !pluginDisabled) {
              // Load route JSON-LD map if not already loaded
              if (!routeJsonLdMap) {
                try {
                  const routeTreeFullPath = resolve(projectRoot, routeTreePath);
                  if (existsSync(routeTreeFullPath)) {
                    // Use a safer require approach that doesn't interfere with module resolution
                    try {
                      console.log(
                        '[analog-json-ld-ssr-DEBUG] Attempting to require route tree:',
                        routeTreeFullPath,
                      );
                      // Don't clear cache to avoid interference with other requires
                      const routeTree = require(routeTreeFullPath);
                      console.log(
                        '[analog-json-ld-ssr-DEBUG] Successfully required route tree',
                      );
                      routeJsonLdMap = routeTree.routeJsonLdMap || new Map();

                      // If the map is empty, disable the plugin for future requests
                      if (routeJsonLdMap?.size === 0) {
                        pluginDisabled = true;
                      }
                    } catch (requireError) {
                      console.log(
                        '[analog-json-ld-ssr-DEBUG] Failed to require route tree:',
                        requireError,
                      );
                      // If require fails, initialize with empty map and disable
                      routeJsonLdMap = new Map();
                      pluginDisabled = true;
                    }
                  } else {
                    routeJsonLdMap = new Map();
                    pluginDisabled = true;
                  }
                } catch {
                  // Route tree might not exist or might not have routeJsonLdMap export
                  // Silently fallback to empty map to avoid disrupting SSR
                  routeJsonLdMap = new Map();
                  pluginDisabled = true;
                }
              }

              // Get the current path
              const path = req.url?.split('?')[0].replace(/\/$/, '') || '/';

              // Get JSON-LD for this route
              const jsonLd = routeJsonLdMap?.get(path);

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
