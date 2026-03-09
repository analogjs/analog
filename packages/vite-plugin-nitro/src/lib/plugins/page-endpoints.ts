import { buildSync } from 'esbuild';
import { normalizePath } from 'vite';

export function pageEndpointsPlugin() {
  return {
    name: 'analogjs-vite-plugin-nitro-rollup-page-endpoint',
    async transform(_code: string, id: string) {
      if (normalizePath(id).includes('/pages/') && id.endsWith('.server.ts')) {
        const compiled = buildSync({
          stdin: {
            contents: _code,
            sourcefile: id,
            loader: 'ts',
          },
          write: false,
          metafile: true,
          platform: 'neutral',
          format: 'esm',
          logLevel: 'silent',
        });

        let fileExports: string[] = [];

        for (let key in compiled.metafile?.outputs) {
          if (compiled.metafile?.outputs[key].entryPoint) {
            fileExports = compiled.metafile?.outputs[key].exports;
          }
        }

        // In h3 v2 / Nitro v3, event.node is undefined during prerendering
        // (which uses the fetch-based pipeline, not Node.js http). We use
        // optional chaining so that page endpoints work in both Node.js
        // server and fetch-based prerender contexts.
        // Import $fetch explicitly since Nitro auto-imports are disabled.
        // In Nitro v3, $fetch comes from 'nitro/deps/ofetch'.
        const code = `
            import { defineHandler } from 'h3';
            import { $fetch } from 'nitro/deps/ofetch';

            ${
              fileExports.includes('load')
                ? _code
                : `
                ${_code}
                export const load = () => {
                  return {};
                }`
            }

            ${
              fileExports.includes('action')
                ? ''
                : `
                export const action = () => {
                  return {};
                }
              `
            }

            export default defineHandler(async(event) => {
              if (event.method === 'GET') {
                try {
                  return await load({
                    params: event.context.params,
                    req: event.node?.req,
                    res: event.node?.res,
                    fetch: $fetch,
                    event
                  });
                } catch(e) {
                  console.error(\` An error occurred: \$\{e\}\`)
                  throw e;
                }
              } else {
                try {
                  return await action({
                    params: event.context.params,
                    req: event.node?.req,
                    res: event.node?.res,
                    fetch: $fetch,
                    event
                  });
                } catch(e) {
                  console.error(\` An error occurred: \$\{e\}\`)
                  throw e;
                }
              }
            });
          `;

        return {
          code,
          map: null,
        };
      }

      return;
    },
  };
}
