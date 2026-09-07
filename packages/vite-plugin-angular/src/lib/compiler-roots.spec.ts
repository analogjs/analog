import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { build } from 'vite';
import angular from '../index';

const roots: string[] = [];

beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('VITEST', undefined);
});

afterEach(async () => {
  vi.unstubAllEnvs();
  for (const root of roots.splice(0)) {
    await rm(root, { recursive: true, force: true });
  }
});

async function createFixture() {
  const root = await mkdtemp(join(tmpdir(), 'analog-compiler-roots-'));
  roots.push(root);
  await mkdir(join(root, 'src'));
  await symlink(
    fileURLToPath(new URL('../../../../node_modules', import.meta.url)),
    join(root, 'node_modules'),
    'junction',
  );
  await writeFile(join(root, 'src/main.ts'), 'export const main = true;');
  await writeFile(
    join(root, 'src/original.ts'),
    'export const replaced = true;',
  );
  await writeFile(
    join(root, 'src/replacement.ts'),
    `
    import { Component } from '@angular/core';
    @Component({ selector: 'app-extra', standalone: true, template: '<p>additional root</p>' })
    export class AdditionalComponent {}
  `,
  );
  await writeFile(
    join(root, 'tsconfig.json'),
    JSON.stringify({
      files: ['src/main.ts'],
      compilerOptions: {
        target: 'es2022',
        module: 'esnext',
        moduleResolution: 'bundler',
        experimentalDecorators: true,
        skipLibCheck: true,
        types: [],
      },
    }),
  );
  return root;
}

describe('compiler roots in a Vite library build', () => {
  it.each([false, true])(
    'AOT-compiles an additional library root (Compilation API: %s)',
    async (useCompilationAPI) => {
      const root = await createFixture();
      await build({
        root,
        configFile: false,
        logLevel: 'silent',
        plugins: [
          angular({
            workspaceRoot: root,
            tsconfig: join(root, 'tsconfig.json'),
            jit: false,
            liveReload: false,
            fileReplacements: [
              { replace: 'src/original.ts', with: 'src/replacement.ts' },
            ],
            include: useCompilationAPI
              ? [join(root, 'src/replacement.ts')]
              : [],
            experimental: { useAngularCompilationAPI: useCompilationAPI },
          }),
        ],
        build: {
          minify: false,
          lib: {
            entry: join(root, 'src/original.ts'),
            formats: ['es'],
            fileName: 'component',
          },
          rollupOptions: { external: ['@angular/core'] },
        },
      });
      const output = await readFile(join(root, 'dist/component.mjs'), 'utf8');
      expect(output).toContain('defineComponent');
      expect(output).toContain('additional root');
      expect(output).not.toContain('__decorate');
    },
    30000,
  );
});
