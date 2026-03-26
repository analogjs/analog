import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import * as path from 'node:path';

const workspaceRoot = path.resolve(__dirname, '../../..');
const toolsOutDir = path.join(
  workspaceRoot,
  'packages/vitest-angular/dist/src/lib/tools',
);
const builtCollectionPath = path.join(toolsOutDir, 'collection.json');
const builtSetupPath = path.join(toolsOutDir, 'src/schematics/setup/index.js');

export default function globalSetup(): void {
  if (existsSync(builtCollectionPath) && existsSync(builtSetupPath)) {
    return;
  }

  // Avoid spawning a nested `nx build` from inside the Nx Vitest executor.
  // That path can fail if the child process cannot read a cached project graph.
  execFileSync(
    'pnpm',
    ['vite', 'build', '-c', 'packages/vitest-angular-tools/vite.config.lib.ts'],
    { cwd: workspaceRoot, stdio: 'inherit' },
  );
}
