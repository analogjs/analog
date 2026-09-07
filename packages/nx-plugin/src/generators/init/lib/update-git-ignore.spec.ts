import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import { describe, expect, it } from 'vitest';
import { updateGitIgnore } from './update-git-ignore';

describe('generated test output ignores', () => {
  it('adds Vitest output even when Nx is already ignored and preserves existing entries', () => {
    const tree = createTreeWithEmptyWorkspace();
    tree.write('.gitignore', 'custom-output/\n.nx/cache\n');
    updateGitIgnore(tree);
    const once = tree.read('.gitignore', 'utf8');
    expect(once).toContain('custom-output/\n.nx/cache\n');
    expect(once).toContain('.vitest/\n');
    expect(once).toContain('.nx/workspace-data\n');
    updateGitIgnore(tree);
    expect(tree.read('.gitignore', 'utf8')).toBe(once);
  });
});
