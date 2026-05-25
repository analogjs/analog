import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
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

  it('forces rollup bundler and builds successfully', async () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), 'analog-build-server-'));
    const outputDir = resolve(workspaceRoot, '.output');
    const serverDir = resolve(outputDir, 'server');
    const publicDir = resolve(outputDir, 'public');

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
        preset: 'node-server',
        routeRules: {},
        static: false,
      },
      close: vi.fn().mockResolvedValue(undefined),
    } as never);
    vi.mocked(prepare).mockResolvedValue(undefined as never);
    vi.mocked(copyPublicAssets).mockResolvedValue(undefined as never);
    vi.mocked(prerender).mockResolvedValue(undefined as never);
    vi.mocked(build).mockResolvedValue(undefined as never);

    try {
      await buildServer({}, { output: { publicDir } });

      expect(createNitro).toHaveBeenCalledWith(
        expect.objectContaining({
          builder: 'rollup',
        }),
      );
      expect(build).toHaveBeenCalled();
    } finally {
      rmSync(workspaceRoot, { recursive: true, force: true });
    }
  });
});
