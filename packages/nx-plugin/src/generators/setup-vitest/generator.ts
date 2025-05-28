import {
  formatFiles,
  generateFiles,
  getProjects,
  installPackagesTask,
  Tree,
} from '@nx/devkit';
import { join } from 'node:path';
import { coerce, major } from 'semver';

import { getInstalledPackageVersion } from '../../utils/version-utils';
import { addAnalogDependencies } from './lib/add-analog-dependencies';
import { updateTestTarget } from './lib/update-test-target';
import { updateTsConfig } from './lib/update-tsconfig';
import { SetupVitestGeneratorSchema } from './schema';

function addFiles(
  tree: Tree,
  options: SetupVitestGeneratorSchema,
  majorAngularVersion: number,
) {
  const projects = getProjects(tree);
  const isNx = tree.exists('/nx.json');

  const projectConfig = projects.get(options.project);

  const templateOptions = {
    ...options,
    majorAngularVersion,
    addNxPaths: isNx,
    template: '',
  };

  generateFiles(
    tree,
    join(__dirname, 'files'),
    projectConfig.root || '.',
    templateOptions,
  );
}

export async function setupVitestGenerator(
  tree: Tree,
  options: SetupVitestGeneratorSchema,
) {
  const angularVersion = getInstalledPackageVersion(tree, '@angular/core');
  const majorAngularVersion = major(coerce(angularVersion));

  const nxVersion = getInstalledPackageVersion(tree, 'nx');

  addAnalogDependencies(tree, angularVersion, nxVersion);
  updateTsConfig(tree, options);
  updateTestTarget(tree, options);

  addFiles(tree, options, majorAngularVersion);

  await formatFiles(tree);

  return () => {
    installPackagesTask(tree);
  };
}

export default setupVitestGenerator;
