import {
  addDependenciesToPackageJson,
  removeDependenciesFromPackageJson,
  Tree,
} from '@nx/devkit';
import { getAnalogDependencies } from '../versions/dependencies';
import { getAnalogDevDependencies } from '../versions/dev-dependencies';

export async function addAnalogDependencies(
  tree: Tree,
  nxVersion: string,
  angularVersion: string
) {
  const dependencies = getAnalogDependencies(nxVersion, angularVersion);
  const devDependencies = getAnalogDevDependencies(nxVersion);
  // ensure previous @analogjs/platform version is removed, whether installed
  // as a dependency or devDependency, before adding analog dependencies.
  removeDependenciesFromPackageJson(
    tree,
    ['@analogjs/platform'],
    ['@analogjs/platform']
  );
  addDependenciesToPackageJson(tree, dependencies, devDependencies);
}
