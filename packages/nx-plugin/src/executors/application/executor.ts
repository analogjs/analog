import { ExecutorContext } from '@nx/devkit';
import { createBuilderContext } from 'nx/src/adapter/ngcli-adapter';
import {
  DevServerBuilderOutput,
  executeDevServerBuilder,
  DevServerBuilderOptions,
  ApplicationBuilderOptions,
  buildApplication,
} from '@angular-devkit/build-angular';

import { loadEsmModule } from '@angular-devkit/build-angular/src/utils/load-esm';
import { NitroConfig } from 'nitropack';
import { Connect, normalizePath } from 'vite';
import { createEvent } from 'h3';

export default async function* runExecutor(
  options: ApplicationBuilderOptions,
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

  // buildApplication(options, builderContext, )

  yield {
    success: true,
  } as unknown as DevServerBuilderOutput;

  await new Promise<void>((resolve) => (deferred = resolve));
}
