import { addDependenciesToPackageJson, Tree } from '@nx/devkit';

import { getAnalogDevDependencies } from '../../../utils/versions/dev-dependencies';
import { getAnalogDependencies } from '../../../utils/versions/dependencies';

export function addAnalogDependencies(
  tree: Tree,
  angularVersion: string,
  vitest: boolean,
  nxVersion?: string,
): void {
  const devDependencies: Record<string, string> = getAnalogDevDependencies(
    angularVersion,
    nxVersion,
  );
  const dependencies = getAnalogDependencies(angularVersion);

  if (!nxVersion) {
    delete devDependencies['@nx/vite'];
  }

  if (!vitest) {
    delete devDependencies['vitest'];
    delete devDependencies['@vitest/coverage-v8'];
    delete devDependencies['@vitest/ui'];
  }

  addDependenciesToPackageJson(
    tree,
    {
      ...dependencies,
      '@angular/platform-server': `^${angularVersion}`,
    },
    devDependencies,
  );
}
