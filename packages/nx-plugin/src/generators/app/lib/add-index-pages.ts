import { generateFiles, Tree } from '@nrwl/devkit';
import * as path from 'path';
import { NormalizedOptions } from '../generator';

export function addIndexPages(tree: Tree, options: NormalizedOptions) {
  const templateOptions = {
    ...options,
    template: '',
  };
  let pageDirectory = options.addTailwind ? 'tailwind' : 'css';
  if (options.addTRPC) {
    pageDirectory += '-trpc';
  }

  generateFiles(
    tree,
    path.join(__dirname, '..', 'files', 'index-pages', pageDirectory),
    options.projectRoot,
    templateOptions
  );
}
