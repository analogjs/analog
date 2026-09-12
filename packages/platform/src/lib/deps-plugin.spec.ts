import angular from '@analogjs/vite-plugin-angular';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { build, createServer, resolveConfig } from 'vite';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';

import { depsPlugin } from './deps-plugin.js';

describe('depsPlugin oxc config', () => {
  it('leaves TypeScript transformation to Vite and the selected compiler', () => {
    const plugins = depsPlugin();
    const result = (plugins[0].config as any)();

    expect(result).not.toHaveProperty('oxc');
    expect(result).not.toHaveProperty('esbuild');
  });
});

describe('server TypeScript compilation', () => {
  beforeEach(() => {
    // Exercise development compilation, not Analog's Vitest-only TS fallback.
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('VITEST', undefined);
  });
  afterEach(() => vi.unstubAllEnvs());

  it.each([
    {
      mode: 'compilation API',
      options: { experimental: { useAngularCompilationAPI: true } },
    },
    { mode: 'fast compile', options: { fastCompile: true } },
  ])(
    'loads a typed server helper with $mode and preserves Angular AOT',
    async ({ options }) => {
      const temporaryRoot = resolve(import.meta.dirname, '../../../../tmp');
      await mkdir(temporaryRoot, { recursive: true });
      const root = await mkdtemp(join(temporaryRoot, 'server-typescript-'));
      try {
        await mkdir(join(root, 'src/server'), { recursive: true });
        await writeFile(
          join(root, 'src/app.ts'),
          `import { Component } from '@angular/core';
         @Component({ selector: 'test-app', template: 'Hello', standalone: true })
         export class App {}`,
        );
        await writeFile(
          join(root, 'tsconfig.json'),
          JSON.stringify({
            compilerOptions: {
              target: 'ES2022',
              module: 'ESNext',
              moduleResolution: 'bundler',
              experimentalDecorators: true,
              skipLibCheck: true,
            },
            angularCompilerOptions: { disableTypeScriptVersionCheck: true },
            files: ['src/app.ts'],
          }),
        );
        await writeFile(
          join(root, 'src/server/helper.ts'),
          `export const CANONICAL_HOST = 'example.com' as const;
         export function canonicalUrl(requestUrl: URL): URL {
           const result = new URL(requestUrl);
           result.hostname = CANONICAL_HOST;
           return result;
         }`,
        );
        const server = await createServer({
          configFile: false,
          root,
          plugins: [
            depsPlugin()[0],
            angular({
              tsconfig: join(root, 'tsconfig.json'),
              liveReload: false,
              ...options,
            }),
          ],
          server: { middlewareMode: true, watch: null },
          optimizeDeps: { noDiscovery: true, include: [] },
        });
        try {
          const helper = await server.ssrLoadModule('/src/server/helper.ts');
          expect(
            helper.canonicalUrl(new URL('https://www.example.com/path?q=1'))
              .href,
          ).toBe('https://example.com/path?q=1');
          const app = await server.transformRequest('/src/app.ts');
          expect(app?.code).toContain('ɵɵdefineComponent');
          expect(app?.code).not.toContain('@Component');
        } finally {
          await server.close();
        }
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    },
  );

  it.each([
    { mode: 'normal', options: {} },
    {
      mode: 'compilation API',
      options: { experimental: { useAngularCompilationAPI: true } },
    },
    { mode: 'fast compile', options: { fastCompile: true } },
  ])('preserves production AOT with $mode', async ({ options }) => {
    vi.stubEnv('NODE_ENV', 'production');
    const temporaryRoot = resolve(import.meta.dirname, '../../../../tmp');
    await mkdir(temporaryRoot, { recursive: true });
    const root = await mkdtemp(join(temporaryRoot, 'production-aot-'));
    try {
      await writeFile(
        join(root, 'app.ts'),
        `import { Component } from '@angular/core';
        @Component({ selector: 'test-app', template: 'Hello', standalone: true })
        export class App {}`,
      );
      await writeFile(
        join(root, 'tsconfig.json'),
        JSON.stringify({
          compilerOptions: {
            target: 'ES2022',
            module: 'ESNext',
            moduleResolution: 'bundler',
            experimentalDecorators: true,
            skipLibCheck: true,
            sourceMap: true,
          },
          angularCompilerOptions: { disableTypeScriptVersionCheck: true },
          files: ['app.ts'],
        }),
      );
      const result = await build({
        configFile: false,
        root,
        plugins: [
          depsPlugin()[0],
          angular({
            tsconfig: join(root, 'tsconfig.json'),
            liveReload: false,
            ...options,
          }),
        ],
        build: {
          write: false,
          minify: false,
          ssr: join(root, 'app.ts'),
          rollupOptions: { external: ['@angular/core'] },
        },
      });
      const output = (Array.isArray(result) ? result : [result]).flatMap(
        (bundle) => ('output' in bundle ? bundle.output : []),
      );
      const code = output
        .filter((item) => item.type === 'chunk')
        .map((item) => item.code)
        .join('\n');
      expect(code).toContain('ɵɵdefineComponent');
      expect(code).not.toContain('__decorate');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it.each(['serve', 'build'] as const)(
    'retains normal Angular compiler ownership during %s',
    async (command) => {
      const config = await resolveConfig(
        {
          configFile: false,
          root: resolve(import.meta.dirname, '../..'),
          plugins: [
            depsPlugin()[0],
            angular({
              tsconfig: resolve(import.meta.dirname, '../../tsconfig.lib.json'),
            }),
          ],
        },
        command,
      );
      expect(config.oxc).toBe(false);
    },
  );

  it('preserves application-authored transform exclusions', async () => {
    const config = await resolveConfig(
      {
        configFile: false,
        plugins: [depsPlugin()[0]],
        oxc: { exclude: ['**/generated/**'] },
      },
      'serve',
    );
    expect(config.oxc).toMatchObject({ exclude: ['**/generated/**'] });
  });
});
