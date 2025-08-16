import {
  Tree,
  getProjects,
  joinPathFragments,
  updateJson,
  writeJson,
} from '@nx/devkit';

import { SetupAnalogGeneratorSchema } from '../schema';

export function updatePackageJson(
  tree: Tree,
  schema: SetupAnalogGeneratorSchema,
) {
  const angularJsonPath = '/angular.json';

  if (tree.exists(angularJsonPath)) {
    const projects = getProjects(tree);
    const projectConfig = projects.get(schema.project);

    if (!projectConfig) {
      throw new Error(`Project ${schema.project} not found`);
    }

    const packageJsonPath = joinPathFragments(
      projectConfig.root || '.',
      'package.json',
    );

    if (tree.exists(packageJsonPath)) {
      updateJson(tree, packageJsonPath, (json) => {
        json.type = 'module';

        return json;
      });
    } else {
      writeJson(tree, packageJsonPath, { type: 'module' });
    }
  } else {
    const projects = getProjects(tree);
    const projectConfig = projects.get(schema.project);

    if (!projectConfig) {
      throw new Error(`Project ${schema.project} not found`);
    }

    const packageJsonPath = joinPathFragments(
      projectConfig.root,
      'package.json',
    );

    writeJson(tree, packageJsonPath, { type: 'module' });
  }
}
