import { Plugin } from 'esbuild';

export const PageRoutesGlob = ({
  projectRoot,
  pageGlobs = [],
}: {
  projectRoot: string;
  pageGlobs: string[];
}): Plugin => ({
  name: 'require-context',
  setup: (build) => {
    const fastGlob = require('fast-glob');
    build.onResolve({ filter: /\*/ }, async (args) => {
      console.log(args.path);
      if (args.resolveDir === '') {
        return; // Ignore unresolvable paths
      }

      return {
        path: args.path,
        namespace: 'import-glob',
        pluginData: {
          resolveDir: args.resolveDir,
        },
      };
    });

    build.onLoad({ filter: /.*/, namespace: 'import-glob' }, async (args) => {
      // console.log('ar', args.pluginData);
      const files = (
        await fastGlob(pageGlobs, {
          dot: true,
        })
      ).sort();

      let importerCode = `
        import { createRoutes } from '@analogjs/router';

        const pages = {${(files as string[])
          .map((page) => {
            return `'${page.replace(
              projectRoot,
              ''
            )}': () => import('${page}')`;
          })
          .join(',')}
        };
      
        const routes = createRoutes(pages);
        export default routes;
      `;

      return { contents: importerCode, resolveDir: args.pluginData.resolveDir };
    });
  },
});
