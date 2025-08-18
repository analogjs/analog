import {
  formatFiles,
  generateFiles,
  getProjects,
  installPackagesTask,
  Tree,
} from '@nx/devkit';
import { major, coerce } from 'semver';
import { join } from 'node:path';

import { getInstalledPackageVersion } from '../../utils/version-utils';
import { addAnalogDependencies } from './lib/add-analog-dependencies';
import { updateTestTsConfig } from './lib/update-test-tsconfig';
import { updateTestTarget } from './lib/update-test-target';
import { SetupAnalogGeneratorSchema } from './schema';
import { updateBuildTarget } from './lib/update-build-target';
import { updateServeTarget } from './lib/update-serve-target';
import { updatePackageJson } from './lib/update-package-json';
import { updateIndex } from './lib/update-index-html';
import { updateMain } from './lib/update-main';
import { updateAppTsConfig } from './lib/update-app-tsconfig';
import { updateGitIgnore } from './lib/update-git-ignore';

function addFiles(
  tree: Tree,
  options: SetupAnalogGeneratorSchema,
  majorAngularVersion: number,
) {
  const isNx = tree.read('/nx.json');
  const projects = getProjects(tree);
  const projectConfig = projects.get(options.project);

  if (!projectConfig) {
    throw new Error(`Project ${options.project} not found`);
  }

  const templateOptions = {
    ...options,
    offsetFromRoot: isNx ? '../../' : './',
    projectRoot: projectConfig.root,
    template: '',
    majorAngularVersion,
    isNx,
  };

  generateFiles(
    tree,
    join(__dirname, 'files'),
    projectConfig.root || '.',
    templateOptions,
  );

  if (options.vitest) {
    generateFiles(
      tree,
      join(__dirname, 'test-files'),
      projectConfig.root || '.',
      templateOptions,
    );
  }
}

export async function setupAnalogGenerator(
  tree: Tree,
  options: SetupAnalogGeneratorSchema,
) {
  const angularVersion = getInstalledPackageVersion(tree, '@angular/core');

  if (!angularVersion) {
    throw new Error('Angular version not found in package.json');
  }

  const coercedVersion = coerce(angularVersion);
  if (!coercedVersion) {
    throw new Error(`Invalid Angular version: ${angularVersion}`);
  }

  const majorAngularVersion = major(coercedVersion);
  addAnalogDependencies(tree, angularVersion);
  updateBuildTarget(tree, options);
  updateServeTarget(tree, options);

  if (options.vitest) {
    updateTestTarget(tree, options);
    updateTestTsConfig(tree, options);
  }

  updateAppTsConfig(tree, options);
  updatePackageJson(tree, options);
  updateIndex(tree, options);
  updateMain(tree, options);
  updateGitIgnore(tree);

  addFiles(tree, options, majorAngularVersion);

  await formatFiles(tree);

  return () => {
    installPackagesTask(tree);
  };
}

export default setupAnalogGenerator;
