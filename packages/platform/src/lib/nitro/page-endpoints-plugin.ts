import { parseSync } from 'oxc-parser';
import { normalizePath } from 'vite';
import { SERVER_FETCH_FACTORY_SNIPPET } from './renderers.js';

export function pageEndpointsPlugin() {
  return {
    name: 'analogjs-platform-rollup-page-endpoint',
    async transform(
      _code: string,
      id: string,
    ): Promise<{ code: string; map: null } | undefined> {
      if (normalizePath(id).includes('/pages/') && id.endsWith('.server.ts')) {
        const result = parseSync(id, _code, {
          sourceType: 'module',
          lang: 'ts',
        });

        const fileExports: string[] = result.module.staticExports.flatMap((e) =>
          e.entries
            .filter((entry) => entry.exportName.name !== null)
            .map((entry) => entry.exportName.name as string),
        );

        // In h3 v2 / Nitro v3, event.node is undefined during prerendering
        // (which uses the fetch-based pipeline, not Node.js http). We use
        // optional chaining so that page endpoints work in both Node.js
        // server and fetch-based prerender contexts.
        //
        // Page loaders expect Nitro-style `$fetch` semantics (parsed data plus
        // internal relative-route support), so we construct a request-local
        // fetch using `createFetch` from ofetch + `fetchWithEvent` from h3.
        const code = `
            import { defineHandler, fetchWithEvent } from 'nitro/h3';
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
              ${SERVER_FETCH_FACTORY_SNIPPET}

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
                  console.error(\` An error occurred: \${e}\`)
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
                  console.error(\` An error occurred: \${e}\`)
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
