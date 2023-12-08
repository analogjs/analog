import {
  formatFiles,
  generateFiles,
  getProjects,
  installPackagesTask,
  Tree,
} from '@nx/devkit';
import * as path from 'path';

import { getInstalledPackageVersion } from '../../utils/version-utils';
import { addAnalogDependencies } from './lib/add-analog-dependencies';
import { updateTsConfig } from './lib/update-tsconfig';
import { updateTestTarget } from './lib/update-test-target';
import { SetupVitestGeneratorSchema } from './schema';

function addFiles(tree: Tree, options: SetupVitestGeneratorSchema) {
  const projects = getProjects(tree);

  const projectConfig = projects.get(options.project);

  const templateOptions = {
    ...options,
    template: '',
  };

  generateFiles(
    tree,
    path.join(__dirname, 'files'),
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
