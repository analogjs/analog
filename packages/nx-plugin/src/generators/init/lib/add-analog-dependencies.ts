import {
  addDependenciesToPackageJson,
  removeDependenciesFromPackageJson,
  Tree,
} from '@nx/devkit';

import { getAnalogDevDependencies } from '../../../utils/versions/dev-dependencies';
import { getAnalogDependencies } from '../../../utils/versions/dependencies';
import { getInstalledPackageVersion } from '../../../utils/version-utils';

export function addAnalogDependencies(tree: Tree, angularVersion: string) {
  const nxVersion = getInstalledPackageVersion(tree, 'nx');
  const devDependencies = getAnalogDevDependencies(angularVersion);
  const dependencies = getAnalogDependencies(angularVersion);

  addDependenciesToPackageJson(tree, dependencies, devDependencies);

  if (!nxVersion) {
    removeDependenciesFromPackageJson(tree, ['@nx/angular'], ['@nx/vite']);
  }
}
