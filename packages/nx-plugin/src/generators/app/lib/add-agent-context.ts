import { Tree } from '@nx/devkit';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const AGENT_CONTEXT_FILES = ['AGENTS.md', 'CLAUDE.md'];

// Seeds agent context in the app so AI coding assistants pick up Analog
// conventions (see node_modules/@analogjs/platform/AGENTS.md).
export function addAgentContext(tree: Tree, projectRoot: string) {
  for (const fileName of AGENT_CONTEXT_FILES) {
    const filePath = `${projectRoot}/${fileName}`;

    if (tree.exists(filePath)) {
      continue;
    }

    tree.write(
      filePath,
      readFileSync(join(__dirname, '..', 'files', 'agents', fileName), 'utf-8'),
    );
  }
}
