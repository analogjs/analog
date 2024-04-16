import { generateFiles, Tree } from '@nx/devkit';
import { join } from 'node:path';
import { NormalizedOptions } from '../generator';

export function addFiles(
  tree: Tree,
  options: NormalizedOptions,
  majorAngularVersion: number
) {
  const isNx = tree.exists('/nx.json');
  const templateOptions = {
    ...options,
    template: '',
    tsconfig: isNx ? 'tsconfig.base.json' : 'tsconfig.json',
  };
  generateFiles(
    tree,
    join(__dirname, '..', 'files', 'template-angular-v' + majorAngularVersion),
    options.projectRoot,
    templateOptions
  );

  if (!tree.exists('/angular.json') && !tree.exists('/tsconfig.base.json')) {
    generateFiles(
      tree,
      join(__dirname, '..', 'files', 'root'),
      '.',
      templateOptions
    );
  }
}
