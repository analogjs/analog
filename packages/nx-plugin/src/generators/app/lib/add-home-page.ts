import { generateFiles, Tree } from '@nx/devkit';
import * as path from 'path';
import { NormalizedOptions } from '../generator';

export function addHomePage(tree: Tree, options: NormalizedOptions) {
  const templateOptions = {
    ...options,
    template: '',
  };

  generateFiles(
    tree,
    path.join(__dirname, '..', 'files', 'index-page'),
    options.projectRoot,
    templateOptions
  );

  let pageDirectory = options.addTailwind ? 'tailwind' : 'css';
  if (options.addTRPC) {
    pageDirectory += '-trpc';
  }

  generateFiles(
    tree,
    path.join(__dirname, '..', 'files', 'welcome-components', pageDirectory),
    options.projectRoot,
    templateOptions
  );
}
