import { ExecutorContext } from '@nx/devkit';
import { createBuilderContext } from 'nx/src/adapter/ngcli-adapter';
import {
  DevServerBuilderOutput,
  executeDevServerBuilder,
  DevServerBuilderOptions,
} from '@angular-devkit/build-angular';

import { DevServerExecutorSchema } from './schema';
import { Observable } from 'rxjs';

export default async function* runExecutor(
  options: DevServerExecutorSchema,
  context: ExecutorContext
) {
  // console.log('Executor ran for DevServer', context.root);

  const builderContext = await createBuilderContext(
    {
      builderName: '@analogjs/platform:application',
      description: 'Build a browser application',
      optionSchema: await import(
        '@angular-devkit/build-angular/src/builders/application/schema.json'
      ),
    },
    context
  );

  // Add cleanup logic via a builder teardown.
  let deferred: () => void;
  builderContext.addTeardown(async () => {
    deferred?.();
  });

  const devServerOptions: DevServerBuilderOptions = {
    buildTarget: 'analog-app:build:development',
    liveReload: true,
    port: 4200,
  };
  const sub = executeDevServerBuilder(
    devServerOptions,
    builderContext,
    undefined
  ).subscribe(console.log);

  builderContext.addTeardown(() => {
    sub.unsubscribe();
  });

  yield {
    success: true,
  } as unknown as DevServerBuilderOutput;

  await new Promise<void>((resolve) => (deferred = resolve));
}
