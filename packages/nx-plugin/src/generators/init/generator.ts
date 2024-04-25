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
import { updateTestTsConfig } from './lib/update-test-tsconfig';
import { updateTestTarget } from './lib/update-test-target';
import { SetupAnalogGeneratorSchema } from './schema';
import { updateBuildTarget } from './lib/update-build-target';
import { updateServeTarget } from './lib/update-serve-target';
import { updatePackageJson } from './lib/update-package-json';
import { updateIndex } from './lib/update-index-html';
import { updateMain } from './lib/update-main';
import { updateAppTsConfig } from './lib/update-app-tsconfig';

function addFiles(tree: Tree, options: SetupAnalogGeneratorSchema) {
  const isNx = tree.read('/nx.json');
  const projects = getProjects(tree);
  const projectConfig = projects.get(options.project);

  const templateOptions = {
    ...options,
    offsetFromRoot: isNx ? '../../' : './',
    projectRoot: projectConfig.root,
    template: '',
  };

  generateFiles(
    tree,
    join(__dirname, 'files'),
    projectConfig.root || '.',
    templateOptions
  );

  if (options.vitest) {
    generateFiles(
      tree,
      join(__dirname, 'test-files'),
      projectConfig.root || '.',
      templateOptions
    );
  }
}

export async function setupAnalogGenerator(
  tree: Tree,
  options: SetupAnalogGeneratorSchema
) {
  const angularVersion = getInstalledPackageVersion(tree, '@angular/core');

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

  addFiles(tree, options);

  await formatFiles(tree);

  return () => {
    installPackagesTask(tree);
  };
}

export default setupAnalogGenerator;
