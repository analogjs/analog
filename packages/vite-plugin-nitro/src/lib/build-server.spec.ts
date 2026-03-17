import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

vi.mock('nitro/builder', () => ({
  build: vi.fn(),
  copyPublicAssets: vi.fn(),
  createNitro: vi.fn(),
  prepare: vi.fn(),
  prerender: vi.fn(),
}));

import {
  build,
  copyPublicAssets,
  createNitro,
  prepare,
  prerender,
} from 'nitro/builder';

import { buildServer } from './build-server';

describe('buildServer', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fails when Nitro leaves an empty vercel config.json', async () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), 'analog-vercel-config-'));
    const outputDir = resolve(workspaceRoot, '.vercel', 'output');
    const serverDir = resolve(outputDir, 'functions', '__server.func');
    const publicDir = resolve(outputDir, 'static');
    const buildConfigPath = resolve(outputDir, 'config.json');

    mkdirSync(serverDir, { recursive: true });
    mkdirSync(publicDir, { recursive: true });

    vi.mocked(createNitro).mockResolvedValue({
      options: {
        framework: {
          name: 'nitro',
          version: '3.0.0',
        },
        output: {
          dir: outputDir,
          publicDir,
          serverDir,
        },
        preset: 'vercel',
        routeRules: {},
        static: false,
        vercel: {
          functions: {
            runtime: 'nodejs24.x',
          },
        },
      },
      close: vi.fn().mockResolvedValue(undefined),
    } as never);
    vi.mocked(prepare).mockResolvedValue(undefined as never);
    vi.mocked(copyPublicAssets).mockResolvedValue(undefined as never);
    vi.mocked(prerender).mockResolvedValue(undefined as never);
    vi.mocked(build).mockImplementation(async () => {
      writeFileSync(buildConfigPath, '', 'utf8');
    });

    try {
      await expect(
        buildServer({}, { preset: 'vercel', output: { publicDir } }),
      ).rejects.toThrow(
        `Nitro generated an empty Vercel build output config at "${buildConfigPath}".`,
      );
    } finally {
      rmSync(workspaceRoot, { recursive: true, force: true });
    }
  });
});
