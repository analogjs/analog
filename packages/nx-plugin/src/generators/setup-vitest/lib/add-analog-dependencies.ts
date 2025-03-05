import { addDependenciesToPackageJson, Tree } from '@nx/devkit';

import { getAnalogDevDependencies } from '../../../utils/versions/dev-dependencies';

export function addAnalogDependencies(
  tree: Tree,
  angularVersion: string,
  nxVersion: string,
) {
  const devDependencies = getAnalogDevDependencies(angularVersion, nxVersion);

  addDependenciesToPackageJson(tree, {}, devDependencies);
}
