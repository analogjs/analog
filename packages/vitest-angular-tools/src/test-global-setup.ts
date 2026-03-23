import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import * as path from 'node:path';

const workspaceRoot = path.resolve(__dirname, '../../..');
const toolsOutDir = path.join(
  workspaceRoot,
  'node_modules/@analogjs/vitest-angular/src/lib/tools',
);
const builtCollectionPath = path.join(toolsOutDir, 'collection.json');
const builtSetupPath = path.join(toolsOutDir, 'src/schematics/setup/index.js');

export default function globalSetup(): void {
  if (existsSync(builtCollectionPath) && existsSync(builtSetupPath)) {
    return;
  }

  execFileSync(
    'pnpm',
    ['nx', 'build', 'vitest-angular-tools', '--skip-nx-cache'],
    { cwd: workspaceRoot, stdio: 'inherit' },
  );
}
