import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { build, normalizePath, type InlineConfig } from 'vite';
// eslint-disable-next-line @nx/enforce-module-boundaries
import { oxcDtsPlugin } from '../../../../tools/build/shared-plugins';

const directories: string[] = [];

afterEach(async () => {
  for (const directory of directories.splice(0)) {
    await rm(directory, { recursive: true, force: true });
  }
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'analog-dts-rebuild-'));
  directories.push(root);
  await mkdir(join(root, 'src'));
  await writeFile(
    join(root, 'src/index.ts'),
    "export type { Options } from './options'; export const value: number = 1;",
  );
  await writeFile(
    join(root, 'src/options.ts'),
    'export interface Options { first?: boolean }',
  );
  const config: InlineConfig = {
    root,
    configFile: false,
    logLevel: 'silent',
    plugins: [oxcDtsPlugin(root)],
    build: {
      outDir: join(root, 'dist'),
      emptyOutDir: false,
      lib: {
        entry: { 'src/index': join(root, 'src/index.ts') },
        formats: ['es'],
      },
      rollupOptions: {
        output: {
          preserveModules: true,
          preserveModulesRoot: normalizePath(root),
          entryFileNames: '[name].js',
        },
      },
    },
  };
  return { root, config };
}

describe('OXC declaration rebuilds', () => {
  it('refreshes type-only declarations while retaining nested build output', async () => {
    const { root, config } = await fixture();
    await build(config);
    const declaration = join(root, 'dist/src/options.d.ts');
    expect(await readFile(declaration, 'utf8')).toContain('first?: boolean');
    await mkdir(join(root, 'dist/nested-plugin'));
    await writeFile(
      join(root, 'dist/nested-plugin/keep.js'),
      'export const keep = true;',
    );
    await writeFile(
      join(root, 'src/options.ts'),
      'export interface Options { second?: string }',
    );

    await build(config);

    const updated = await readFile(declaration, 'utf8');
    expect(updated).toContain('second?: string');
    expect(updated).not.toContain('first');
    expect(
      await readFile(join(root, 'dist/nested-plugin/keep.js'), 'utf8'),
    ).toBe('export const keep = true;');
  });
});
