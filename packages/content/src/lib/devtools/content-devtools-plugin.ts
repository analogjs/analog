import type { Plugin } from 'vite';

/**
 * Vite plugin that injects the Analog Content DevTools panel in dev mode.
 *
 * Shows parse time, frontmatter data, TOC, and content stats in a floating
 * panel. Dev-only — completely stripped from production builds.
 *
 * @experimental Content DevTools is experimental and may change in future releases.
 *
 * @example
 * ```typescript
 * // vite.config.ts
 * import { contentDevToolsPlugin } from '@analogjs/content/devtools';
 *
 * export default defineConfig({
 *   plugins: [
 *     analog({ ... }),
 *     contentDevToolsPlugin(),
 *   ],
 * });
 * ```
 */
export function contentDevToolsPlugin(): Plugin {
  let isDev = false;

  return {
    name: 'analog-content-devtools',
    apply: 'serve',

    configResolved(config) {
      isDev = config.command === 'serve';
    },

    transformIndexHtml: {
      order: 'post',
      handler(html) {
        if (!isDev) return html;

        const { readFileSync } = require('node:fs') as typeof import('node:fs');
        const { resolve, dirname } =
          require('node:path') as typeof import('node:path');
        const { fileURLToPath } =
          require('node:url') as typeof import('node:url');

        const pluginDir = dirname(fileURLToPath(import.meta.url));
        const cssPath = resolve(pluginDir, 'content-devtools.styles.css');
        const clientPath = resolve(pluginDir, 'content-devtools-client.ts');

        let css: string;
        let clientCode: string;
        try {
          css = readFileSync(cssPath, 'utf-8');
          clientCode = readFileSync(clientPath, 'utf-8');
        } catch {
          // Fallback: files may not exist if running from compiled output.
          // The plugin silently degrades — no devtools panel.
          return html;
        }

        // Strip TypeScript type annotations for inline injection.
        // This is a simple removal for the known patterns in the client script.
        const jsCode = clientCode
          .replace(/:\s*DevToolsData\b/g, '')
          .replace(/:\s*Record<string,\s*unknown>/g, '')
          .replace(/:\s*Array<\{[^}]+\}>/g, '')
          .replace(/:\s*HTMLElement/g, '')
          .replace(/:\s*string/g, '')
          .replace(/:\s*boolean/g, '')
          .replace(/:\s*number/g, '')
          .replace(/:\s*null/g, '')
          .replace(/interface\s+DevToolsData\s*\{[\s\S]*?\}/, '')
          .replace(/as\s+EventListener/g, '')
          .replace(/as\s+HTMLElement/g, '')
          .replace(/\|\s*null/g, '');

        const injection = `
<style>${css}</style>
<script type="module">${jsCode}</script>`;

        return html.replace('</body>', `${injection}\n</body>`);
      },
    },
  };
}
