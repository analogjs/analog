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
        // subpath that older codegen relied on.
        //
        // Page loaders expect Nitro-style `$fetch` semantics (parsed data plus
        // internal relative-route support), so construct a request-local fetch
        // using public APIs:
        // - `createFetch` from `ofetch` for `$fetch` behavior
        // - `fetchWithEvent` from `h3` for internal Nitro request routing
        //
        // This avoids both unstable private Nitro imports and assumptions about
        // a global runtime `$fetch` being available during prerender.
        const code = `
            import { defineHandler, fetchWithEvent } from 'h3';
            import { createFetch } from 'ofetch';

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
              const serverFetch = createFetch({
                fetch: (resource, init) => {
                  const url = resource instanceof Request ? resource.url : resource.toString();
                  return fetchWithEvent(event, url, init);
                }
              });

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
