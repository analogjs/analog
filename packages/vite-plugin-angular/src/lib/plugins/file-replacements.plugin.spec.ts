import { resolve } from 'node:path';
import { normalizePath } from 'vite';
import { describe, expect, it } from 'vitest';

import {
  replaceFiles,
  type FileReplacement,
} from './file-replacements.plugin.js';

const workspaceRoot = resolve('/workspace');

async function resolveWith(
  replacements: FileReplacement[],
  resolvedPath: string,
  environment = 'client',
) {
  const plugin = replaceFiles(replacements, workspaceRoot);
  if (!plugin) {
    throw new Error('expected a plugin');
  }
  const resolveId = plugin.resolveId as (
    ...args: unknown[]
  ) => Promise<{ id: string } | null>;

  return resolveId.call(
    {
      environment: { name: environment },
      resolve: async () => ({ id: normalizePath(resolvedPath) }),
    },
    './env',
    undefined,
    {},
  );
}

describe('replaceFiles', () => {
  const replacements = [
    { replace: 'app/src/env.ts', with: 'app/src/env.prod.ts' },
  ];

  it('replaces the file at the workspace-relative path', async () => {
    await expect(
      resolveWith(replacements, resolve(workspaceRoot, 'app/src/env.ts')),
    ).resolves.toEqual({ id: resolve(workspaceRoot, 'app/src/env.prod.ts') });
  });

  it('does not replace another file that shares the path suffix', async () => {
    await expect(
      resolveWith(replacements, resolve(workspaceRoot, 'myapp/src/env.ts')),
    ).resolves.toBeNull();
  });

  it('does not replace another SSR file that shares the path suffix', async () => {
    await expect(
      resolveWith(
        [{ replace: 'app/src/env.ts', ssr: 'app/src/env.server.ts' }],
        resolve(workspaceRoot, 'myapp/src/env.ts'),
        'ssr',
      ),
    ).resolves.toBeNull();
  });

  it('matches an absolute replace path', async () => {
    const replace = resolve(workspaceRoot, 'app/src/env.ts');

    await expect(
      resolveWith([{ replace, with: 'app/src/env.prod.ts' }], replace),
    ).resolves.toEqual({ id: resolve(workspaceRoot, 'app/src/env.prod.ts') });
  });
});
