import { addDependenciesToPackageJson, generateFiles, Tree } from '@nx/devkit';
import * as path from 'path';
import { NormalizedOptions } from '../generator';
import { getTrpcDependencies } from '../versions/trpc-dependencies';

export async function addTrpc(
  tree: Tree,
  projectRoot: string,
  nxVersion: string,
  options: NormalizedOptions
) {
  const dependencies = getTrpcDependencies(nxVersion);
  addDependenciesToPackageJson(tree, dependencies, {});

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
