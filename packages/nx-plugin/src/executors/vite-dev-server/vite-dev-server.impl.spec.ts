import type { ExecutorContext } from '@nx/devkit';
import { describe, expect, it, vi } from 'vitest';

import viteDevServerExecutor from './vite-dev-server.impl';

const nxVite = vi.hoisted(() => ({
  viteDevServerExecutor: undefined as unknown,
}));
const server = vi.hoisted(() => ({
  listen: vi.fn(),
  printUrls: vi.fn(),
  close: vi.fn(),
  resolvedUrls: { local: ['http://localhost:4200/'] },
}));
const vite = vi.hoisted(() => ({ createServer: vi.fn(async () => server) }));

vi.mock('@nx/vite/executors', () => nxVite);
vi.mock('@nx/devkit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@nx/devkit')>()),
  readTargetOptions: () => ({
    configFile: 'apps/my-app/vite.config.ts',
    mode: 'staging',
  }),
}));
vi.mock('../../utils/executor-utils', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../utils/executor-utils')>()),
  loadEsm: async () => vite,
  waitForExit: async () => undefined,
}));

const context = {
  root: '/workspace',
  projectName: 'my-app',
  projectsConfigurations: { projects: { 'my-app': { root: 'apps/my-app' } } },
  projectGraph: {
    nodes: {
      'my-app': { data: { root: 'apps/my-app', targets: { build: {} } } },
    },
  },
} as unknown as ExecutorContext;

describe('viteDevServerExecutor', () => {
  it('delegates to the Nx executor when available', async () => {
    const nxExecutor = vi.fn(async function* () {
      yield { success: true, baseUrl: 'nx' };
    });
    nxVite.viteDevServerExecutor = nxExecutor;
    const options = { buildTarget: 'my-app:build' };

    const output = await viteDevServerExecutor(options, context).next();

    expect(nxExecutor).toHaveBeenCalledWith(options, context);
    expect(output.value).toEqual({ success: true, baseUrl: 'nx' });
    expect(vite.createServer).not.toHaveBeenCalled();
  });

  it('starts a Vite dev server when the Nx executor is missing (Nx 24)', async () => {
    nxVite.viteDevServerExecutor = undefined;

    const executor = viteDevServerExecutor(
      { buildTarget: 'my-app:build:development', port: 4300 },
      context,
    );
    const output = await executor.next();
    await executor.next();

    expect(vite.createServer).toHaveBeenCalledWith(
      expect.objectContaining({
        configFile: '/workspace/apps/my-app/vite.config.ts',
        root: '/workspace/apps/my-app',
        mode: 'staging',
        server: expect.objectContaining({ port: 4300 }),
      }),
    );
    expect(server.listen).toHaveBeenCalled();
    expect(server.close).toHaveBeenCalled();
    expect(output.value).toEqual({
      success: true,
      baseUrl: 'http://localhost:4200/',
    });
  });
});
