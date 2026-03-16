import { Tree } from '@nx/devkit';

export function updateGitIgnore(tree: Tree) {
  const gitIgnorePath = '/.gitignore';

  if (tree.exists(gitIgnorePath)) {
    const gitIgnoreContents = tree.read(gitIgnorePath, 'utf-8');

    if (gitIgnoreContents && !gitIgnoreContents.includes('.nx/cache')) {
      const updatedGitIgnore = `${gitIgnoreContents}\n
.nx/cache
.nx/workspace-data`;
      tree.write(gitIgnorePath, updatedGitIgnore);
    }
  }
}
