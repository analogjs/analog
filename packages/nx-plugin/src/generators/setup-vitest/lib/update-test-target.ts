import {
  Tree,
  getProjects,
  updateJson,
  updateProjectConfiguration,
} from '@nx/devkit';

import { SetupVitestGeneratorSchema } from '../schema';

export function updateTestTarget(
  tree: Tree,
  schema: SetupVitestGeneratorSchema
) {
  const angularJsonPath = '/angular.json';

  if (tree.exists(angularJsonPath)) {
    updateJson(
      tree,
      angularJsonPath,
      (json) => {
        json.projects[schema.project].architect.test = {
          builder: '@analogjs/vitest-angular:test',
        };

        return json;
      },
      { expectComments: true, allowTrailingComma: true }
    );
  } else {
    const projects = getProjects(tree);

    const projectConfig = projects.get(schema.project);

    projectConfig.targets.test = {
      executor: '@analogjs/vitest-angular:test',
    };

    updateProjectConfiguration(tree, schema.project, projectConfig);
  }
}
