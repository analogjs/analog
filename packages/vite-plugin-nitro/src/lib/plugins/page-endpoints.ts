import { normalizePath } from 'vite';

export function pageEndpointsPlugin() {
  return {
    name: 'analogjs-vite-plugin-nitro-rollup-page-endpoint',
    transform(code: string, id: string) {
      if (
        id.includes(normalizePath('src/app/pages')) &&
        id.endsWith('.server.ts')
      ) {
        return {
          code: `
            import { defineEventHandler } from 'h3';

            ${code}

            export default defineEventHandler(async(event) => {
              try {
                return await load({
                  params: event.context.params,
                  req: event.node.req,
                  res: event.node.res,
                  fetch: $fetch
                });
              } catch(e) {
                console.error(\` An error occurred: \$\{e\}\`)
                throw e;
              }
            });
          `,
          map: null,
        };
      }

      return;
    },
  };
}
