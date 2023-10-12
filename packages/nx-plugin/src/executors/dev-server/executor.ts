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
    [
      {
        name: 'test',
        setup(build) {
          console.log('setup plugin');
          build.onResolve({ filter: /.*/ }, (args) => {
            if (args.path.includes('@analogjs')) {
              console.log('onResolve', args.path);
            }
            return undefined;
          });

          build.onLoad({ filter: /.*/ }, (args) => {
            console.log('onLoad', args.path);
            if (args.path.includes('@analogjs')) {
            }
            return undefined;
          });
        },
      },
    ]
  )) {
    // console.log(result.outputFiles[0].contents);
  }

  return {
    success: true,
  };
}
