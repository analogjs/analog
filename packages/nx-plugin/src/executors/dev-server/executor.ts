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

  // builderContext.getBuilderNameForTarget = () =>
  //   Promise.resolve('@angular-devkit/build-angular:application');

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

  const rootDir = 'apps/analog-app';
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
  }).subscribe();

  builderContext.addTeardown(() => {
    sub.unsubscribe();
  });

  yield {
    success: true,
  } as unknown as DevServerBuilderOutput;

  await new Promise<void>((resolve) => (deferred = resolve));
}
