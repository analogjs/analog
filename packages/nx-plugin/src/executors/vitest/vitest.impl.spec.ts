import type { ExecutorContext } from '@nx/devkit';
import { describe, expect, it, vi } from 'vitest';

import vitestExecutor from './vitest.impl';

const nxVitest = vi.hoisted(() => ({ vitestExecutor: undefined }));
const failedTests = vi.hoisted(() => ({ count: 0 }));
const vitest = vi.hoisted(() => ({
  startVitest: vi.fn(async () => ({
    state: { getCountOfFailedTests: () => failedTests.count },
  })),
}));

vi.mock('@nx/vitest/executors', () => nxVitest);
vi.mock('../../utils/executor-utils', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../utils/executor-utils')>()),
  loadEsm: async () => vitest,
}));

const context = {
  root: '/workspace',
  projectName: 'my-app',
  projectsConfigurations: { projects: { 'my-app': { root: 'apps/my-app' } } },
} as unknown as ExecutorContext;

describe('vitestExecutor', () => {
  it('runs Vitest when the Nx executor is missing (Nx 24)', async () => {
    const output = await vitestExecutor(
      { configFile: 'apps/my-app/vite.config.ts', testFiles: ['app.spec'] },
      context,
    ).next();

    expect(vitest.startVitest).toHaveBeenCalledWith(
      'test',
      ['app.spec'],
      expect.objectContaining({
        root: '/workspace/apps/my-app',
        config: '/workspace/apps/my-app/vite.config.ts',
        watch: false,
      }),
    );
    expect(output.value).toEqual({ success: true });
  });

  it('fails when tests fail', async () => {
    failedTests.count = 1;

    const output = await vitestExecutor({}, context).next();

    expect(output.value).toEqual({ success: false });
  });
});
