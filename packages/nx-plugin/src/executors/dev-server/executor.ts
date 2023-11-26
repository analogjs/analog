import { ExecutorContext } from '@nx/devkit';
import { createBuilderContext } from 'nx/src/adapter/ngcli-adapter';
import {
  DevServerBuilderOutput,
  executeDevServerBuilder,
  DevServerBuilderOptions,
  ApplicationBuilderOptions,
} from '@angular-devkit/build-angular';

import { loadEsmModule } from '@angular-devkit/build-angular/src/utils/load-esm';
import { NitroConfig } from 'nitropack';
import { Connect, normalizePath } from 'vite';
import { createEvent } from 'h3';

import { Plugin } from 'esbuild';

const PageRoutesGlob = ({
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

// export default EsbuildPluginImportGlob;

export default async function* runExecutor(
  options: DevServerBuilderOptions,
  context: ExecutorContext
) {
  const builderContext = await createBuilderContext(
    {
      builderName: '@angular-devkit/build-angular:application',
      description: 'Build a browser application',
      optionSchema: await import(
        '@angular-devkit/build-angular/src/builders/application/schema.json'
      ),
    },
    context
  );

  builderContext.getBuilderNameForTarget = () =>
    Promise.resolve('@angular-devkit/build-angular:application');

  builderContext.getTargetOptions = (target) => {
    const appBuilderOptions: ApplicationBuilderOptions =
      context.projectsConfigurations.projects[target.project].targets[
        target.target
      ].options;

    return Promise.resolve(appBuilderOptions as any);
  };

  let deferred: () => void;
  builderContext.addTeardown(async () => {
    deferred?.();
  });

  const { createNitro, createDevServer, build } = await loadEsmModule<
    typeof import('nitropack')
  >('nitropack');

  const rootDir =
    context.projectsConfigurations.projects[context.projectName].root;
  let nitroConfig: NitroConfig = {
    rootDir,
    logLevel: 3,
    srcDir: normalizePath(`${rootDir}/src/server`),
    scanDirs: [normalizePath(`${rootDir}/src/server`)],
  };

  const nitro = await createNitro({
    dev: true,
    ...nitroConfig,
  });
  const server = createDevServer(nitro);
  await build(nitro);

  const nitroApiMiddleware: Connect.NextHandleFunction = async (
    req,
    res,
    next
  ) => {
    if (req.originalUrl.startsWith('/api')) {
      req.url = req.originalUrl.replace('/api', '');
      await server.app.handler(createEvent(req, res));
      return;
    }
    next();
  };

  const sub = executeDevServerBuilder(options, builderContext, undefined, {
    middleware: [nitroApiMiddleware],
    buildPlugins: [
      PageRoutesGlob({
        projectRoot: rootDir,
        pageGlobs: [`${rootDir}/src/app/pages/**/*.page.ts`],
      }),
    ],
  }).subscribe();

  builderContext.addTeardown(() => {
    sub.unsubscribe();
  });

  yield {
    success: true,
  } as unknown as DevServerBuilderOutput;

  await new Promise<void>((resolve) => (deferred = resolve));
}
