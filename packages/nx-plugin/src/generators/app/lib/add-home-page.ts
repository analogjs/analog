import { generateFiles, Tree } from '@nx/devkit';
import { join } from 'node:path';
import { NormalizedOptions } from '../generator';

export function addHomePage(tree: Tree, options: NormalizedOptions) {
  const templateOptions = {
    ...options,
    template: '',
  };

  generateFiles(
    tree,
    join(__dirname, '..', 'files', 'index-page'),
    options.projectRoot,
    templateOptions,
  );

  let pageDirectory = options.addTailwind ? 'tailwind' : 'css';
  if (options.addTRPC) {
    pageDirectory += '-trpc';
  }

  generateFiles(
    tree,
    join(__dirname, '..', 'files', 'welcome-components', pageDirectory),
    options.projectRoot,
    templateOptions,
  );
}
