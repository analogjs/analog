import { mkdtemp, rm, writeFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

const lifecycle = vi.hoisted(() => ({
  init: undefined as undefined | ((renderer: unknown) => void),
  compiled: undefined as undefined | (() => Promise<void>),
  close: vi.fn(),
  closeRenderer: vi.fn(),
  unhook: vi.fn(),
  serverDir: '',
  compileFails: false,
}));
vi.mock('nitropack', () => ({
  createNitro: async () => ({
    hooks: {
      hook: (_: string, callback: typeof lifecycle.init) => {
        lifecycle.init = callback;
        return lifecycle.unhook;
      },
    },
    close: lifecycle.close,
  }),
  prepare: vi.fn(),
  copyPublicAssets: vi.fn(),
  prerender: async () => {
    lifecycle.init?.({
      options: { output: { serverDir: lifecycle.serverDir } },
      hooks: {
        hook: (_: string, callback: typeof lifecycle.compiled) => {
          lifecycle.compiled = callback;
        },
      },
      close: lifecycle.closeRenderer,
    });
    if (!lifecycle.compileFails) await lifecycle.compiled?.();
    throw new Error('Prerender failed');
  },
}));
import { buildServer } from '../build-server';

describe('locale worker prerender cleanup', () => {
  it.each([false, true])(
    'cleans up on failure (compile failure: %s)',
    async (compileFails) => {
      vi.clearAllMocks();
      lifecycle.compileFails = compileFails;
      const directory = await mkdtemp(join(tmpdir(), 'analog-prerender-'));
      lifecycle.serverDir = directory;
      try {
        await writeFile(
          join(directory, 'index.mjs'),
          `import { writeFileSync } from 'node:fs'; writeFileSync(${JSON.stringify(join(directory, 'imported'))}, 'imported'); export async function closePrerenderer() { writeFileSync(${JSON.stringify(join(directory, 'closed'))}, 'closed'); }`,
        );
        await expect(
          buildServer(
            {
              ssr: true,
              i18n: {
                defaultLocale: 'es',
                locales: ['es', 'en'],
                loader: './i18n.ts',
              },
            },
            { preset: 'node-server', prerender: { routes: ['/en', '/es'] } },
            undefined,
            true,
          ),
        ).rejects.toThrow('Prerender failed');
        for (const marker of ['imported', 'closed']) {
          expect(
            await access(join(directory, marker)).then(
              () => true,
              () => false,
            ),
          ).toBe(!compileFails);
        }
        expect(lifecycle.closeRenderer).toHaveBeenCalledOnce();
        expect(lifecycle.close).toHaveBeenCalledOnce();
        expect(lifecycle.unhook).toHaveBeenCalledOnce();
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    },
  );
});
