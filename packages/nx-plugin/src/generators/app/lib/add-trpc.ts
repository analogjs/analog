import {
  addDependenciesToPackageJson,
  generateFiles,
  Tree,
} from '@nrwl/devkit';
import * as path from 'path';
import {
  V15_ANALOG_TRPC,
  V15_ZOD,
  V16_ANALOG_JS_TRPC,
  V16_ZOD,
} from '../versions';

export async function addTRPC(
  tree: Tree,
  projectRoot: string,
  majorAngularVersion: number
) {
  addDependenciesToPackageJson(
    tree,
    {
      '@analogjs/trpc':
        majorAngularVersion === 15 ? V15_ANALOG_TRPC : V16_ANALOG_JS_TRPC,
      zod: majorAngularVersion === 15 ? V15_ZOD : V16_ZOD,
    },
    {}
  );

  generateFiles(
    tree,
    path.join(__dirname, '..', 'files', 'trpc'),
    projectRoot,
    { template: '' }
  );
}
