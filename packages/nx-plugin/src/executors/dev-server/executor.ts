import { ExecutorContext } from '@nx/devkit';
import { convertNxExecutor } from '@nx/devkit';
import { buildApplication } from '@angular-devkit/build-angular';
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
      builderName: 'browser-esbuilds',
      description: 'Build a browser application',
      optionSchema: await import(
        '@angular-devkit/build-angular/src/builders/browser-esbuild/schema.json'
      ),
    },
    context
  );
  // console.log('builderContext', builderContext.workspaceRoot);
  builderContext.workspaceRoot = `${context.root}`;

  const plugin = () => {
    return {
      name: 'test',
      setup(build) {
        console.log('setup plugin');
        build.onResolve({ filter: /.*/ }, (args) => {
          console.log('onResolve', args);
          return undefined;
        });

        build.onLoad({ filter: /.*/ }, (args) => {
          console.log('onLoad', args);
          return undefined;
        });
      },
    };
  };
  console.log('buildApplication');
  for await (const result of buildApplication(
    {
      aot: true,
      browser: 'apps/analog-app/src/main.ts',
      index: 'apps/analog-app/index.html',
      server: 'apps/analog-app/src/main.server.ts',
      outputPath: 'dist/apps/analog-app/client',
      tsConfig: 'apps/analog-app/tsconfig.app.json',
      progress: false,
      watch: true,
      optimization: false,
    },
    builderContext as any,
    [plugin()]
  )) {
    // console.log(result.outputFiles[0].contents);
  }

  return {
    success: true,
  };
}
