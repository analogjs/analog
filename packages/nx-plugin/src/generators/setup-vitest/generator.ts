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

  const projectConfig = projects.get(options.project);

  if (!projectConfig) {
    throw new Error(`Project "${options.project}" not found.`);
  }

  const templateOptions = {
    ...options,
    majorAngularVersion,
    template: '',
  };

  generateFiles(
    tree,
    join(__dirname, 'files'),
    projectConfig.root || '.',
    templateOptions,
  );
}

async function setupVitestGenerator(
  tree: Tree,
  options: SetupVitestGeneratorSchema,
): Promise<() => void> {
  const angularVersion = getInstalledPackageVersion(tree, '@angular/core');

  if (!angularVersion) {
    throw new Error('@angular/core is not installed.');
  }

  const coercedVersion = coerce(angularVersion);

  if (!coercedVersion) {
    throw new Error(`Unable to coerce Angular version: ${angularVersion}`);
  }

  const majorAngularVersion = major(coercedVersion);

  const nxVersion = getInstalledPackageVersion(tree, 'nx');

  addAnalogDependencies(tree, angularVersion, nxVersion ?? '');
  updateTsConfig(tree, options);
  updateTestTarget(tree, options);

  addFiles(tree, options, majorAngularVersion);

  await formatFiles(tree);

  return () => {
    installPackagesTask(tree);
  };
}

export default setupVitestGenerator;
