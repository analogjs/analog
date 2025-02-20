import {
  Tree,
  getProjects,
  updateJson,
  updateProjectConfiguration,
} from '@nx/devkit';

import { SetupAnalogGeneratorSchema } from '../schema';

export function updateTestTarget(
  tree: Tree,
  schema: SetupAnalogGeneratorSchema,
) {
  const angularJsonPath = '/angular.json';
  const commonConfig = {
    options: {
      config: 'vite.config.ts',
    },
  };

  if (tree.exists(angularJsonPath)) {
    updateJson(
      tree,
      angularJsonPath,
      (json) => {
        json.projects[schema.project].architect.test = {
          builder: '@analogjs/vitest-angular:test',
          ...commonConfig,
        };

        return json;
      },
      { expectComments: true, allowTrailingComma: true },
    );
  } else {
    const projects = getProjects(tree);

    const projectConfig = projects.get(schema.project);

    projectConfig.targets.test = {
      executor: '@analogjs/vitest-angular:test',
      ...commonConfig,
    };

    updateProjectConfiguration(tree, schema.project, projectConfig);
  }
}
