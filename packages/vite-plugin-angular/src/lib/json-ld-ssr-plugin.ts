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
  let routeJsonLdMap: Map<string, any> | null = null;
  let projectRoot: string;

  return {
    name: 'analog-json-ld-ssr',
    enforce: 'post',

    configResolved(config) {
      projectRoot = config.root;
    },

    configureServer(server) {
      // Hook into the middleware to inject JSON-LD
      server.middlewares.use(async (req, res, next) => {
        // Store the original end method
        const originalEnd = res.end;

        // Override the end method to inject JSON-LD
        res.end = function (chunk?: any, encoding?: any) {
          // Check if this is an HTML response
          const contentType = res.getHeader('content-type');
          if (contentType && contentType.toString().includes('text/html')) {
            let html = '';
            if (chunk) {
              html = typeof chunk === 'string' ? chunk : chunk.toString();
            }

            // Only process if it contains HTML structure
            if (html && html.includes('</head>')) {
              // Load route JSON-LD map if not already loaded
              if (!routeJsonLdMap) {
                try {
                  const routeTreeFullPath = resolve(projectRoot, routeTreePath);
                  if (existsSync(routeTreeFullPath)) {
                    // Clear the require cache to get fresh data
                    delete require.cache[require.resolve(routeTreeFullPath)];
                    const routeTree = require(routeTreeFullPath);
                    routeJsonLdMap = routeTree.routeJsonLdMap || new Map();
                  } else {
                    routeJsonLdMap = new Map();
                  }
                } catch (error) {
                  // Route tree might not exist or might not have routeJsonLdMap export
                  routeJsonLdMap = new Map();
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
