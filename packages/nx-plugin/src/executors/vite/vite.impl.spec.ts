import type { ExecutorContext } from '@nx/devkit';
import { describe, expect, it, vi } from 'vitest';

import viteBuildExecutor from './vite.impl';

const nxVite = vi.hoisted(() => ({ viteBuildExecutor: undefined }));
const vite = vi.hoisted(() => ({ build: vi.fn() }));

vi.mock('@nx/vite/executors', () => nxVite);
vi.mock('../../utils/executor-utils', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../utils/executor-utils')>()),
  loadEsm: async () => vite,
}));

const context = {
  root: '/workspace',
  projectName: 'my-app',
  projectsConfigurations: { projects: { 'my-app': { root: 'apps/my-app' } } },
} as unknown as ExecutorContext;

describe('viteBuildExecutor', () => {
  it('builds with Vite when the Nx executor is missing (Nx 24)', async () => {
    const output = await viteBuildExecutor(
      {
        configFile: 'apps/my-app/vite.config.ts',
        outputPath: 'dist/apps/my-app/client',
        sourcemap: true,
      },
      context,
    ).next();

    expect(vite.build).toHaveBeenCalledWith(
      expect.objectContaining({
        configFile: '/workspace/apps/my-app/vite.config.ts',
        root: '/workspace/apps/my-app',
        mode: 'production',
        build: expect.objectContaining({
          outDir: '/workspace/dist/apps/my-app/client',
          sourcemap: true,
        }),
      }),
    );
    expect(output.value).toEqual({ success: true });
  });
});
