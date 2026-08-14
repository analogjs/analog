import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Plugin } from 'vite';
import { transformWithOxc } from 'vite';

/**
 * Vite plugin that injects the Analog Content DevTools panel in dev mode.
 *
 * Shows render time, frontmatter data, TOC, and content stats in a floating
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
      async handler(html) {
        if (!isDev) return html;

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

        const transformResult = await transformWithOxc(
          clientCode,
          'content-devtools-client.ts',
          { lang: 'ts' },
        );

        const injection = `
<style>${css}</style>
<script type="module">${transformResult.code}</script>`;

        return html.replace('</body>', `${injection}\n</body>`);
      },
    },
  };
}
