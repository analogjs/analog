import { addDependenciesToPackageJson, Tree } from '@nx/devkit';
import { getAnalogDependencies } from '../versions/dependencies';
import { getAnalogDevDependencies } from '../versions/dev-dependencies';

export async function addAnalogDependencies(
  tree: Tree,
  nxVersion: string,
  angularVersion: string
) {
  const dependencies = getAnalogDependencies(nxVersion, angularVersion);
  const devDependencies = getAnalogDevDependencies(nxVersion);
  addDependenciesToPackageJson(tree, dependencies, devDependencies);
}
