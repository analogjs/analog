import {
  Tree,
  getProjects,
  joinPathFragments,
  updateJson,
  updateProjectConfiguration,
} from '@nx/devkit';

import { SetupAnalogGeneratorSchema } from '../schema';

export function updateBuildTarget(
  tree: Tree,
  schema: SetupAnalogGeneratorSchema,
) {
  const angularJsonPath = '/angular.json';

  const commonConfig = {
    options: {
      configFile: 'vite.config.ts',
      main: 'src/main.ts',
      outputPath: 'dist/client',
      tsConfig: 'tsconfig.app.json',
    },
    defaultConfiguration: 'production',
    configurations: {
      development: {
        mode: 'development',
      },
      production: {
        sourcemap: false,
        mode: 'production',
      },
    },
  };

  if (tree.exists(angularJsonPath)) {
    const projects = getProjects(tree);

    const projectConfig = projects.get(schema.project);

    if (!projectConfig) {
      throw new Error(`Project ${schema.project} not found`);
    }

    updateJson(tree, angularJsonPath, (json) => {
      json.projects[schema.project].root = projectConfig.root;
      json.projects[schema.project].sourceRoot = projectConfig.sourceRoot;
      json.projects[schema.project].architect.build = {
        builder: '@analogjs/platform:vite',
        ...commonConfig,
        options: {
          configFile: `${joinPathFragments(
            projectConfig.root,
            'vite.config.ts',
          )}`,
          main: `${joinPathFragments(projectConfig.root, 'src/main.ts')}`,
          outputPath: `dist/${joinPathFragments(projectConfig.root, 'client')}`,
          tsConfig: `${joinPathFragments(
            projectConfig.root,
            'tsconfig.app.json',
          )}`,
        },
      };

      return json;
    });
  } else {
    const projects = getProjects(tree);

    const projectConfig = projects.get(schema.project);

    if (!projectConfig) {
      throw new Error(`Project ${schema.project} not found`);
    }

    if (!projectConfig.targets) {
      projectConfig.targets = {};
    }

    projectConfig.targets.build = {
      executor: '@analogjs/platform:vite',
      ...commonConfig,
      options: {
        configFile: `${joinPathFragments(
          projectConfig.root,
          'vite.config.ts',
        )}`,
        main: `${joinPathFragments(projectConfig.root, 'src/main.ts')}`,
        outputPath: `dist/${joinPathFragments(projectConfig.root, 'client')}`,
        tsConfig: `${joinPathFragments(
          projectConfig.root,
          'tsconfig.app.json',
        )}`,
      },
    };

    updateProjectConfiguration(tree, schema.project, projectConfig);
  }
}
