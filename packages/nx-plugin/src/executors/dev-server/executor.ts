import { ExecutorContext } from '@nx/devkit';
import { convertNxExecutor } from '@nx/devkit';
import { buildApplicationInternal } from '@angular-devkit/build-angular/src/builders/application';
import { createBuilderContext } from 'nx/src/adapter/ngcli-adapter';

import { DevServerExecutorSchema } from './schema';

export default async function* runExecutor(
  options: DevServerExecutorSchema,
  context: ExecutorContext
) {
  console.log('Executor ran for DevServer', options);
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
  for await (const result of buildApplicationInternal(
    {
      browser: 'apps/analog-app/src/main.ts',
      index: 'apps/analog-app/index.html',
      outputPath: 'dist/apps/analog-app/client',
      tsConfig: 'apps/analog-app/tsconfig.app.json',
    },
    builderContext,
    { write: false }
  )) {
    console.log(result);
  }

  return {
    success: true,
  };
}
