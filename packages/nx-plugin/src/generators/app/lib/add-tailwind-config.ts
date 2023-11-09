import { generateFiles, Tree } from '@nx/devkit';
import * as path from 'path';

export async function addTailwindConfig(
  tree: Tree,
  projectRoot: string,
  projectName: string,
  majorNxVersion: number
) {
  if (majorNxVersion >= 16) {
    await (
      await import(
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        '@nx/angular/generators'
      )
    ).setupTailwindGenerator(tree, {
      project: projectName,
    });
  } else {
    await (
      await import(
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        '@nrwl/angular/generators'
      )
    ).setupTailwindGenerator(tree, { project: projectName });
  }

  generateFiles(
    tree,
    path.join(__dirname, '..', 'files', 'tailwind'),
    projectRoot,
    { template: '' }
  );
}
