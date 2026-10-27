import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { prerender } from 'nitropack';

import { buildServer } from './build-server.js';

vi.mock('nitropack', () => ({
  createNitro: vi.fn(async (config: { static?: boolean }) => ({
    options: { static: config.static ?? false },
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

  it.each([{ ssr: true }, { ssr: true, static: true }])(
    'removes the client index.html shell before prerendering / (%o)',
    async (options) => {
      vi.mocked(prerender).mockImplementationOnce(async () => {
        writeFileSync(join(publicDir, 'index.html'), 'prerendered');
      });

      await buildServer(options, {
        output: { publicDir },
        prerender: { routes: ['/'] },
      });

      expect(indexFiles()).toEqual([true, false, false]);
      expect(readFileSync(join(publicDir, 'index.html'), 'utf8')).toBe(
        'prerendered',
      );
    },
  );

  it('removes the client index.html shell for SSR when / is not prerendered', async () => {
    await buildServer(
      { ssr: true },
      { output: { publicDir }, prerender: { routes: ['/about'] } },
    );

    expect(indexFiles()).toEqual([false, false, false]);
  });

  it('keeps the client index.html shell for static builds when / is not prerendered', async () => {
    await buildServer(
      { ssr: true, static: true },
      { output: { publicDir }, prerender: { routes: ['/about'] } },
    );

    expect(indexFiles()).toEqual([true, true, true]);
  });

  it('keeps the client index.html shell for static Nitro presets when / is not prerendered', async () => {
    await buildServer(
      { ssr: true },
      {
        static: true,
        output: { publicDir },
        prerender: { routes: ['/about'] },
      },
    );

    expect(indexFiles()).toEqual([true, true, true]);
  });

  it('keeps the client index.html shell when SSR is disabled', async () => {
    await buildServer(
      { ssr: false },
      { output: { publicDir }, prerender: { routes: ['/about'] } },
    );

    expect(indexFiles()).toEqual([true, true, true]);
  });
});
