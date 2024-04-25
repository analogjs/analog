import {
  formatFiles,
  generateFiles,
  getProjects,
  installPackagesTask,
  Tree,
} from '@nx/devkit';
import { join } from 'node:path';

import { getInstalledPackageVersion } from '../../utils/version-utils';
import { addAnalogDependencies } from './lib/add-analog-dependencies';
import { updateTestTarget } from './lib/update-test-target';
import { updateTsConfig } from './lib/update-tsconfig';
import { SetupVitestGeneratorSchema } from './schema';

function addFiles(tree: Tree, options: SetupVitestGeneratorSchema) {
  const projects = getProjects(tree);
  const isNx = tree.exists('/nx.json');

  const projectConfig = projects.get(options.project);

  const templateOptions = {
    ...options,
    addNxPaths: isNx,
    template: '',
  };

  generateFiles(
    tree,
    join(__dirname, 'files'),
    projectConfig.root || '.',
    templateOptions
  );
}

export async function setupVitestGenerator(
  tree: Tree,
  options: SetupVitestGeneratorSchema
) {
  const angularVersion = getInstalledPackageVersion(tree, '@angular/core');

  addAnalogDependencies(tree, angularVersion);
  updateTsConfig(tree, options);
  updateTestTarget(tree, options);

  addFiles(tree, options);

  await formatFiles(tree);

  return () => {
    installPackagesTask(tree);
  };
}

export default setupVitestGenerator;
