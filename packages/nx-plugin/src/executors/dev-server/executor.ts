import { ExecutorContext } from '@nx/devkit';
import { convertNxExecutor } from '@nx/devkit';
import { buildApplicationInternal } from '@angular-devkit/build-angular/src/builders/application';
import { createBuilderContext } from 'nx/src/adapter/ngcli-adapter';

import { DevServerExecutorSchema } from './schema';
import path = require('path');

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

  for await (const result of buildApplicationInternal(
    {
      browser: 'apps/analog-app/src/main.ts',
      index: 'apps/analog-app/index.html',
      server: 'apps/analog-app/src/main.server.ts',
      outputPath: 'dist/apps/analog-app/client',
      tsConfig: 'apps/analog-app/tsconfig.app.json',
      progress: false,
      watch: true,
      optimization: false,
    },
    builderContext,
    { write: true }
  )) {
    // console.log(result.outputFiles[0].contents);
  }

  return {
    success: true,
  };
}
