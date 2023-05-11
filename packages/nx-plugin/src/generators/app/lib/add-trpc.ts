import {
  addDependenciesToPackageJson,
  generateFiles,
  Tree,
} from '@nrwl/devkit';
import * as path from 'path';
import {
  V15_ANALOG_JS_TRPC,
  V15_ISOMORPHIC_FETCH,
  V15_SUPERJSON,
  V15_TRPC_CLIENT,
  V15_TRPC_SERVER,
  V15_ZOD,
  V16_ANALOG_JS_TRPC,
  V16_SUPERJSON,
  V16_TRPC_CLIENT,
  V16_TRPC_SERVER,
  V16_ZOD,
} from '../versions';
import { NormalizedOptions } from '../generator';

export async function addTRPC(
  tree: Tree,
  projectRoot: string,
  majorAngularVersion: number,
  options: NormalizedOptions
) {
  addDependenciesToPackageJson(
    tree,
    {
      '@analogjs/trpc':
        majorAngularVersion === 15 ? V15_ANALOG_JS_TRPC : V16_ANALOG_JS_TRPC,
      '@trpc/client':
        majorAngularVersion === 15 ? V15_TRPC_CLIENT : V16_TRPC_CLIENT,
      '@trpc/server':
        majorAngularVersion === 15 ? V15_TRPC_SERVER : V16_TRPC_SERVER,
      superjson: majorAngularVersion === 15 ? V15_SUPERJSON : V16_SUPERJSON,
      'isomorphic-fetch':
        majorAngularVersion === 15
          ? V15_ISOMORPHIC_FETCH
          : V15_ISOMORPHIC_FETCH,
      zod: majorAngularVersion === 15 ? V15_ZOD : V16_ZOD,
    },
    {}
  );

  const templateOptions = {
    ...options,
    template: '',
  };
  generateFiles(
    tree,
    path.join(__dirname, '..', 'files', 'trpc'),
    projectRoot,
    templateOptions
  );
}
