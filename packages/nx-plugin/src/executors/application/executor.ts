import { ExecutorContext } from '@nx/devkit';
import { createBuilderContext } from 'nx/src/adapter/ngcli-adapter';
import {
  DevServerBuilderOutput,
  ApplicationBuilderOptions,
  buildApplication,
} from '@angular-devkit/build-angular';

import { PageRoutesGlob } from '../utils/routes-plugin';

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

  const rootDir =
    context.projectsConfigurations.projects[context.projectName].root;

  for await (const _ of buildApplication(options, builderContext, [
    PageRoutesGlob({
      projectRoot: rootDir,
      pageGlobs: [`${rootDir}/src/app/pages/**/*.page.ts`],
    }),
  ])) {
    // Nothing to do for each event, just wait for the whole build.
  }

  yield {
    success: true,
  } as unknown as DevServerBuilderOutput;
}
