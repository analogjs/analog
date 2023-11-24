import { loadEsmModule } from '@angular-devkit/build-angular/src/utils/load-esm';
import { NitroExecutorSchema } from './schema';
import { NitroConfig } from 'nitropack';
import { normalizePath } from 'vite';
import * as path from 'path';
import * as fs from 'fs';

export default async function runExecutor(options: NitroExecutorSchema) {
  console.log('Executor ran for Nitro', options);
  const { createNitro, build, prepare, copyPublicAssets, prerender } =
    await loadEsmModule<typeof import('nitropack')>('nitropack');

  const workspaceRoot = process.cwd();
  const rootDir = 'apps/analog-app';
  let nitroConfig: NitroConfig = {
    rootDir,
    logLevel: 3,
    srcDir: normalizePath(`${rootDir}/src/server`),
    scanDirs: [normalizePath(`${rootDir}/src/server`)],
    output: {
      dir: normalizePath(
        path.resolve(workspaceRoot, 'dist', rootDir, 'analog')
      ),
      publicDir: normalizePath(
        path.resolve(workspaceRoot, 'dist', rootDir, 'analog/public')
      ),
    },
    publicAssets: [
      { dir: path.join(workspaceRoot, 'dist/apps/analog-app/client/browser') },
    ],
    serverAssets: [
      {
        baseName: 'public',
        dir: path.join(workspaceRoot, 'dist/apps/analog-app/client/browser'),
      },
    ],
    handlers: [
      {
        handler: path.join(
          workspaceRoot,
          'packages/vite-plugin-nitro/src/lib/runtime/api-middleware'
        ),
        middleware: true,
      },
    ],
    renderer: path.join(
      workspaceRoot,
      'packages/vite-plugin-nitro/src/lib/runtime/renderer'
    ),
    alias: {
      '#analog/ssr': normalizePath(
        path.join(
          workspaceRoot,
          'dist/apps/analog-app/client/server/main.server'
        )
      ),
      '#analog/index': normalizePath(
        path.join(
          workspaceRoot,
          'dist/apps/analog-app/client/browser/index.html'
        )
      ),
    },
  };

  const nitro = await createNitro({
    dev: false,
    preset: 'node-server',
    ...nitroConfig,
  });

  await prepare(nitro);
  await copyPublicAssets(nitro);

  if (
    nitroConfig?.prerender?.routes &&
    nitroConfig?.prerender?.routes.find((route) => route === '/')
  ) {
    // Remove the root index.html so it can be replaced with the prerendered version
    if (fs.existsSync(`${nitroConfig?.output?.publicDir}/index.html`)) {
      console.log(`rm ${nitroConfig?.output?.publicDir}/index.html`);
      fs.unlinkSync(`${nitroConfig?.output?.publicDir}/index.html`);
    }
  }

  await prerender(nitro);
  await build(nitro);

  return {
    success: true,
  };
}
