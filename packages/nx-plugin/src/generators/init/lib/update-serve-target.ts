import {
  Tree,
  getProjects,
  updateJson,
  updateProjectConfiguration,
} from '@nx/devkit';

import { SetupAnalogGeneratorSchema } from '../schema';

export function updateServeTarget(
  tree: Tree,
  schema: SetupAnalogGeneratorSchema,
) {
  const angularJsonPath = '/angular.json';

  const commonConfig = {
    defaultConfiguration: 'development',
    options: {
      buildTarget: `${schema.project}:build`,
      port: 4200,
    },
    configurations: {
      development: {
        buildTarget: `${schema.project}:build:development`,
        hmr: true,
      },
      production: {
        buildTarget: `${schema.project}:build:production`,
      },
    },
  };

  if (tree.exists(angularJsonPath)) {
    updateJson(
      tree,
      angularJsonPath,
      (json) => {
        json.projects[schema.project].root = '.';
        json.projects[schema.project].architect.serve = {
          builder: '@analogjs/platform:vite-dev-server',
          ...commonConfig,
        };

        return json;
      },
      { expectComments: true, allowTrailingComma: true },
    );
  } else {
    const projects = getProjects(tree);

    const projectConfig = projects.get(schema.project);

    projectConfig.targets.serve = {
      executor: '@analogjs/platform:vite-dev-server',
      ...commonConfig,
    };
    projectConfig.targets.build.outputs = [
      `{workspaceRoot}/dist/apps/${projectConfig.name}`,
    ];

    updateProjectConfiguration(tree, schema.project, projectConfig);
  }
}
