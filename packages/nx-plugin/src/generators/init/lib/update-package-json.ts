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
  schema: SetupAnalogGeneratorSchema
) {
  const angularJsonPath = '/angular.json';
  const packageJsonPath = '/package.json';

  if (tree.exists(angularJsonPath)) {
    updateJson(tree, packageJsonPath, (json) => {
      json.type = 'module';

      return json;
    });
  } else {
    const projects = getProjects(tree);
    const projectConfig = projects.get(schema.project);

    const packageJsonPath = joinPathFragments(
      projectConfig.root,
      'package.json'
    );

    writeJson(tree, packageJsonPath, { type: 'module' });
  }
}
