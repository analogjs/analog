import type { ExecutorContext } from '@nx/devkit';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import viteDevServerExecutor from './vite-dev-server.impl';

const nxExecutors = vi.hoisted(() => ({
  viteDevServerExecutor: undefined as unknown,
}));
const createServer = vi.hoisted(() => vi.fn());

vi.mock('@nx/vite/executors', () => nxExecutors);
vi.mock('vite', () => ({ createServer }));
vi.mock('@nx/devkit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@nx/devkit')>()),
  readTargetOptions: () => ({
    configFile: 'apps/my-app/vite.config.ts',
    mode: 'development',
  }),
}));

const context = {
  root: '/workspace',
  cwd: '/workspace',
  isVerbose: false,
  projectName: 'my-app',
  projectsConfigurations: {
    version: 2,
    projects: { 'my-app': { root: 'apps/my-app' } },
  },
  projectGraph: {
    nodes: {
      'my-app': {
        name: 'my-app',
        type: 'app',
        data: { root: 'apps/my-app', targets: { build: {} } },
      },
    },
    dependencies: {},
  },
} as unknown as ExecutorContext;

const options = { buildTarget: 'my-app:build:development', port: 4300 };

describe('vite-dev-server executor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    nxExecutors.viteDevServerExecutor = undefined;
  });

  it('delegates to the Nx executor when it is available', async () => {
    const nxExecutor = vi.fn(async function* () {
      yield { success: true, baseUrl: 'http://nx' };
    });
    nxExecutors.viteDevServerExecutor = nxExecutor;

    const result = await viteDevServerExecutor(options, context).next();

    expect(nxExecutor).toHaveBeenCalledWith(options, context);
    expect(result.value).toEqual({ success: true, baseUrl: 'http://nx' });
    expect(createServer).not.toHaveBeenCalled();
  });

  it('starts a Vite dev server when the Nx executor is missing', async () => {
    createServer.mockResolvedValue({
      listen: vi.fn(),
      printUrls: vi.fn(),
      close: vi.fn(),
      resolvedUrls: { local: ['http://localhost:4300/'], network: [] },
    });

    const result = await viteDevServerExecutor(options, context).next();

    expect(createServer).toHaveBeenCalledWith(
      expect.objectContaining({
        root: '/workspace/apps/my-app',
        configFile: '/workspace/apps/my-app/vite.config.ts',
        mode: 'development',
        server: expect.objectContaining({ port: 4300 }),
      }),
    );
    expect(result.value).toEqual({
      success: true,
      baseUrl: 'http://localhost:4300/',
    });
  });
});
