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

        for (const key in compiled.metafile?.outputs) {
          if (compiled.metafile?.outputs[key].entryPoint) {
            fileExports = compiled.metafile?.outputs[key].exports;
          }
        }

        const code = `
            import { eventHandler } from 'h3';

            ${
              fileExports.includes('load')
                ? _code
                : `
                ${_code}
                export const load = async () => {
                  console.log('[Default Load] Called default load function');
                  const result = {};
                  console.log('[Default Load] Returning:', result);
                  return result;
                }`
            }

            ${
              fileExports.includes('action')
                ? ''
                : `
                export const action = async () => {
                  console.log('[Default Action] Called default action function');
                  const result = {};
                  console.log('[Default Action] Returning:', result);
                  return result;
                }
              `
            }

            export default eventHandler(async(event) => {
              console.log('[Page Endpoint] Request URL:', event.req.url);
              console.log('[Page Endpoint] Method:', event.method);
              console.log('[Page Endpoint] File exports:', ${JSON.stringify(fileExports)});

              if (event.method === 'GET') {
                try {
                  console.log('[Page Endpoint] Calling load function...');
                  const result = await load({
                    params: event.context.params,
                    req: event.node.req,
                    res: event.node.res,
                    fetch: globalThis.$fetch,
                    event
                  });

                  console.log('[Page Endpoint] Load result type:', typeof result);
                  console.log('[Page Endpoint] Load result constructor:', result?.constructor?.name);
                  console.log('[Page Endpoint] Load result:', JSON.stringify(result, null, 2));

                  const finalResult = result || {};
                  console.log('[Page Endpoint] Final result:', JSON.stringify(finalResult, null, 2));

                  return finalResult;
                } catch(e) {
                  console.error('[Page Endpoint] An error occurred:', e);
                  throw e;
                }
              } else {
                try {
                  console.log('[Page Endpoint] Calling action function...');
                  const result = await action({
                    params: event.context.params,
                    req: event.node.req,
                    res: event.node.res,
                    fetch: globalThis.$fetch,
                    event
                  });
                  console.log('[Page Endpoint] Action result:', JSON.stringify(result, null, 2));
                  return result;
                } catch(e) {
                  console.error('[Page Endpoint] An error occurred:', e);
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
