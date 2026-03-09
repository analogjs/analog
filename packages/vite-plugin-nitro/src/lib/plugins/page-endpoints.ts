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
        // Nitro v3 no longer guarantees the private `nitro/deps/ofetch`
        // subpath that older codegen relied on. The runtime-supported surface
        // is Nitro's global `$fetch`, so the generated module resolves it from
        // `globalThis` instead of baking in another private Nitro import.
        //
        // This keeps the generated page endpoint code aligned with Nitro's
        // supported runtime contract and avoids hard-coding a package export
        // that can disappear across pre-release updates.
        const code = `
            import { defineHandler } from 'h3';
            const serverFetch = (globalThis as typeof globalThis & { $fetch?: typeof fetch }).$fetch;

            if (!serverFetch) {
              throw new Error('Nitro runtime $fetch is not available for page endpoints.');
            }

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
                    fetch: serverFetch,
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
                    fetch: serverFetch,
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
