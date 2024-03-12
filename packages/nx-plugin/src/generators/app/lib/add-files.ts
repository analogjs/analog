import { generateFiles, Tree } from '@nx/devkit';
import { join } from 'node:path';
import { NormalizedOptions } from '../generator';

export function addFiles(
  tree: Tree,
  options: NormalizedOptions,
  majorAngularVersion: number
) {
  const templateOptions = {
    ...options,
    template: '',
  };
  generateFiles(
    tree,
    join(__dirname, '..', 'files', 'template-angular-v' + majorAngularVersion),
    options.projectRoot,
    templateOptions
  );

  if (!tree.read('/tsconfig.base.json')) {
    generateFiles(
      tree,
      join(__dirname, '..', 'files', 'root'),
      '.',
      templateOptions
    );
  }
}
