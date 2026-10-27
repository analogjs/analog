import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildServer } from './build-server.js';

vi.mock('nitropack', () => ({
  createNitro: vi.fn(async () => ({
    hooks: { hook: vi.fn() },
    close: vi.fn(),
  })),
  prepare: vi.fn(),
  copyPublicAssets: vi.fn(),
  prerender: vi.fn(),
  build: vi.fn(),
}));

describe('buildServer', () => {
  let publicDir: string;

  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    publicDir = mkdtempSync(join(tmpdir(), 'analog-build-server-'));
    for (const ext of ['', '.br', '.gz']) {
      writeFileSync(join(publicDir, `index.html${ext}`), '<app-root>');
    }
  });

  afterEach(() => {
    rmSync(publicDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  const indexFiles = () =>
    ['', '.br', '.gz'].map((ext) =>
      existsSync(join(publicDir, `index.html${ext}`)),
    );

  it('removes the client index.html shell for SSR when / is not prerendered', async () => {
    await buildServer(
      { ssr: true, static: true },
      { output: { publicDir }, prerender: { routes: ['/about'] } },
    );

    expect(indexFiles()).toEqual([false, false, false]);
  });

  it('keeps the client index.html shell when SSR is disabled', async () => {
    await buildServer(
      { ssr: false, static: true },
      { output: { publicDir }, prerender: { routes: ['/about'] } },
    );

    expect(indexFiles()).toEqual([true, true, true]);
  });
});
