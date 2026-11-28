import type { DirEntry, Tree } from '@angular-devkit/schematics';

/** Visits every workspace file without descending into `node_modules`. */
export function visitWorkspaceFiles(
  tree: Tree,
  visitor: (filePath: string) => void,
): void {
  visitDirectory(tree.root, visitor);
}

function visitDirectory(
  directory: DirEntry,
  visitor: (filePath: string) => void,
): void {
  const prefix = directory.path === '/' ? '' : directory.path;
  for (const file of directory.subfiles) {
    visitor(`${prefix}/${file}`);
  }
  for (const subdirectory of directory.subdirs) {
    if (subdirectory !== 'node_modules') {
      visitDirectory(directory.dir(subdirectory), visitor);
    }
  }
}
