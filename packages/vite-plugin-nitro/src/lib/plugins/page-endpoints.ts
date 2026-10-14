import { parseSync } from 'oxc-parser';
import { normalizePath } from 'vite';

export function pageEndpointsPlugin() {
  return {
    name: 'analogjs-vite-plugin-nitro-rollup-page-endpoint',
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

        const code = `
            import { defineEventHandler } from 'h3';

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

            export default defineEventHandler(async(event) => {
              if (event.method === 'GET') {
                try {
                  return await load({
                    params: event.context.params,
                    req: event.node.req,
                    res: event.node.res,
                    fetch: $fetch,
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
                    req: event.node.req,
                    res: event.node.res,
                    fetch: $fetch,
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
