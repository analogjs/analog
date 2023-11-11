import { ExecutorContext } from '@nx/devkit';
import { convertNxExecutor } from '@nx/devkit';
import { buildApplication } from '@angular-devkit/build-angular';
import { createBuilderContext } from 'nx/src/adapter/ngcli-adapter';

import { DevServerExecutorSchema } from './schema';
import path = require('path');
import { buildApplicationInternal } from '@angular-devkit/build-angular/src/builders/application';
import { InlineStyleLanguage } from '@angular-devkit/build-angular/src/builders/application/schema';

export default async function* runExecutor(
  options: DevServerExecutorSchema,
  context: ExecutorContext
) {
  console.log('Executor ran for DevServer', context.root);

  const builderContext = await createBuilderContext(
    {
      builderName: 'browser-esbuild',
      description: 'Build a browser application',
      optionSchema: await import(
        '@angular-devkit/build-angular/src/builders/browser-esbuild/schema.json'
      ),
    },
    context
  );
  // console.log('builderContext', builderContext.workspaceRoot);
  builderContext.workspaceRoot = `${context.root}`;
  builderContext.currentDirectory = `${context.root}/apps/analog-app`;
  builderContext.logger = {
    warn() {},
    error() {},
    log() {},
    debug() {},
    info() {},
    fatal() {},
    createChild(name: string) {},
  } as any;

  for await (const result of buildApplicationInternal(
    {
      aot: true,
      entryPoints: new Set([
        'apps/analog-app/src/main.ts',
        'apps/analog-app/src/app/app.component.ts',
        'apps/analog-app/src/app/pages/(home).page.ts',
        'apps/analog-app/src/app/pages/cart.page.ts',
      ]),
      // browser: 'apps/analog-app/src/main.ts',
      index: false,
      // server: 'apps/analog-app/src/main.server.ts',
      outputPath: 'dist/apps/analog-app/client',
      tsConfig: 'apps/analog-app/tsconfig.app.json',
      progress: false,
      // watch: true,
      optimization: false,
      inlineStyleLanguage: InlineStyleLanguage.Scss,
    },
    builderContext as any,
    { write: true }
  )) {
    // console.log(
    //   result.outputFiles.find((f) => f.path.endsWith('app.component.js')).text
    // );
  }

  return {
    success: true,
  };
}
