import { generateFiles, Tree } from '@nx/devkit';
import * as path from 'node:path';
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
    path.join(
      __dirname,
      '..',
      'files',
      'template-angular-v' + majorAngularVersion
    ),
    options.projectRoot,
    templateOptions
  );

  if (!tree.read('/tsconfig.base.json')) {
    generateFiles(
      tree,
      path.join(__dirname, '..', 'files', 'root'),
      '.',
      templateOptions
    );
  }
}
