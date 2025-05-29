import { addDependenciesToPackageJson, Tree } from '@nx/devkit';

import { getAnalogDevDependencies } from '../../../utils/versions/dev-dependencies';
import { getAnalogDependencies } from '../../../utils/versions/dependencies';

export function addAnalogDependencies(tree: Tree, angularVersion: string) {
  const devDependencies = getAnalogDevDependencies(angularVersion);
  const dependencies = getAnalogDependencies(angularVersion);

  addDependenciesToPackageJson(
    tree,
    {
      ...dependencies,
      '@angular/platform-server': angularVersion,
    },
    devDependencies,
  );
}
