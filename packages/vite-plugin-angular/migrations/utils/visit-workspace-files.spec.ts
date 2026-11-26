import { describe, expect, it } from 'vitest';
import { UnitTestTree } from '@angular-devkit/schematics/testing';
import { HostTree } from '@angular-devkit/schematics';

import { visitWorkspaceFiles } from './visit-workspace-files';

describe('visitWorkspaceFiles', () => {
  it('visits nested workspace files and skips every node_modules folder', () => {
    const tree = new UnitTestTree(new HostTree());
    tree.create('/package.json', '{}');
    tree.create('/apps/app/vite.config.ts', '');
    tree.create('/node_modules/vite/package.json', '{}');
    tree.create('/apps/app/node_modules/.vite/deps.js', '');

    const visited: string[] = [];
    visitWorkspaceFiles(tree, (filePath) => visited.push(filePath));

    expect(visited.sort()).toEqual([
      '/apps/app/vite.config.ts',
      '/package.json',
    ]);
  });
});
