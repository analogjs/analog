import { describe, expect, it, vi } from 'vitest';

vi.mock('vite', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vite')>();
  return {
    ...actual,
    build: vi.fn(),
  };
});

import { build } from 'vite';

import { buildClientApp, buildSSRApp } from './build-ssr';

describe('build helpers', () => {
  it('uses the client output directory for the explicit legacy rebuild', async () => {
    const workspaceRoot = '/workspace';

    await buildClientApp(
      {
        root: '/workspace/apps/my-app',
      },
      {
        workspaceRoot,
      },
    );

    expect(build).toHaveBeenCalledWith(
      expect.objectContaining({
        build: expect.objectContaining({
          ssr: false,
          outDir: '/workspace/dist/apps/my-app/client',
          emptyOutDir: true,
        }),
      }),
    );
  });

  it('preserves client output when starting the SSR sub-build', async () => {
    const workspaceRoot = '/workspace';

    await buildSSRApp(
      {
        root: '/workspace/apps/my-app',
        build: {
          outDir: '../../dist/apps/my-app/client',
          emptyOutDir: true,
        },
      },
      {
        workspaceRoot,
      },
    );

    expect(build).toHaveBeenCalledWith(
      expect.objectContaining({
        build: expect.objectContaining({
          ssr: true,
          outDir: '/workspace/dist/apps/my-app/ssr',
          emptyOutDir: false,
        }),
      }),
    );
  });
});
