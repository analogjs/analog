import { loadEsmModule } from '@angular-devkit/build-angular/src/utils/load-esm';
import { ExecutorContext } from '@nx/devkit';
import { NitroConfig } from 'nitropack';
import * as path from 'path';

import { NitroExecutorSchema } from './schema';

export default async function runExecutor(
  options: NitroExecutorSchema,
  context: ExecutorContext
) {
  // console.log('Executor ran for Nitro', options);
  const { normalizePath } = await import('vite');
  const { createNitro, build, prepare, copyPublicAssets } = await loadEsmModule<
    typeof import('nitropack')
  >('nitropack');

  const projectConfig =
    context.projectsConfigurations.projects[context.projectName];

  const workspaceRoot = context.root;
  const rootDir = projectConfig.root;
  const nitroConfig: NitroConfig = {
    rootDir,
    logLevel: 0,
    srcDir: normalizePath(`${rootDir}/src/server`),
    scanDirs: [normalizePath(`${rootDir}/src/server`)],
    output: {
      dir: normalizePath(path.resolve(workspaceRoot, options.outputPath)),
      publicDir: normalizePath(
        path.resolve(workspaceRoot, options.staticBuildOutputPath)
      ),
      serverDir: normalizePath(
        path.resolve(workspaceRoot, options.serverBuildOutputPath)
      ),
    },
    buildDir: normalizePath(
      path.resolve(workspaceRoot, options.buildOutputPath, '.nitro')
    ),
    publicAssets: [
      { dir: path.join(workspaceRoot, options.buildOutputPath, 'browser') },
    ],
    serverAssets: [
      {
        baseName: 'public',
        dir: path.join(workspaceRoot, options.buildOutputPath, 'browser'),
      },
    ],
    handlers: [
      {
        handler: path.join(__dirname, './runtime/api-middleware'),
        middleware: true,
      },
    ],
    renderer: path.join(__dirname, './runtime/renderer'),
    alias: {
      '#analog/ssr': normalizePath(
        path.join(workspaceRoot, options.buildOutputPath, 'server', 'server')
      ),
      '#analog/index': normalizePath(
        path.join(
          workspaceRoot,
          options.buildOutputPath,
          'server',
          'index.server.html'
        )
      ),
    },
  };

  const nitro = await createNitro({
    dev: false,
    preset: options.preset,
    ...nitroConfig,
  });

  await prepare(nitro);
  await copyPublicAssets(nitro);
  await build(nitro);

  return {
    success: true,
  };
}
