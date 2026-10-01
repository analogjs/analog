import { Tree } from '@nx/devkit';

export function updateGitIgnore(tree: Tree) {
  const gitIgnorePath = '/.gitignore';
  let gitIgnoreContents = tree.read(gitIgnorePath, 'utf-8') ?? '';

  if (!gitIgnoreContents.includes('.nx/cache')) {
    gitIgnoreContents += `\n
.nx/cache
.nx/workspace-data`;
  }

  if (!gitIgnoreContents.includes('.vitest/')) {
    gitIgnoreContents += '\n.vitest/\n';
  }

  tree.write(gitIgnorePath, gitIgnoreContents);
}
