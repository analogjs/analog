import { Tree } from '@nx/devkit';

export function updateGitIgnore(tree: Tree): void {
  const gitIgnorePath = '/.gitignore';

  const contents = tree.read(gitIgnorePath, 'utf-8') ?? '';
  const existing = new Set(contents.split(/\r?\n/));
  const missing = ['.nx/cache', '.nx/workspace-data', '.vitest/'].filter(
    (entry) => !existing.has(entry),
  );
  if (!missing.length) return;
  const prefix =
    !contents || contents.endsWith('\n') ? contents : `${contents}\n`;
  tree.write(gitIgnorePath, `${prefix}${missing.join('\n')}\n`);
}
