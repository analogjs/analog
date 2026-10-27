import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createServer, normalizePath, type ViteDevServer } from 'vite';
import { afterEach, describe, expect, it } from 'vitest';
import { angular, type PluginOptions } from './angular-vite-plugin';

describe('compilation selection', () => {
  it.each<{ options: PluginOptions; name: string }>([
    { options: {}, name: '@analogjs/vite-plugin-angular' },
    { options: { fastCompile: false }, name: '@analogjs/vite-plugin-angular' },
    {
      options: { fastCompile: true },
      name: '@analogjs/vite-plugin-angular-fast-compile',
    },
    {
      options: { compilation: 'ngtsc', fastCompile: true },
      name: '@analogjs/vite-plugin-angular',
    },
    {
      options: { compilation: 'ngp', fastCompile: false },
      name: '@analogjs/vite-plugin-angular-ngp',
    },
    {
      options: { compilation: 'ngp', fastCompile: true },
      name: '@analogjs/vite-plugin-angular-ngp',
    },
  ])('selects $name for $options', ({ options, name }) => {
    const plugins = angular({ ...options, jit: false, liveReload: true });
    expect(
      plugins
        .map((plugin) => plugin.name)
        .filter((pluginName) =>
          [
            '@analogjs/vite-plugin-angular',
            '@analogjs/vite-plugin-angular-fast-compile',
            '@analogjs/vite-plugin-angular-ngp',
          ].includes(pluginName),
        ),
    ).toEqual([name]);
  });

  it('uses ngtsc under Vitest when jit is not set', () => {
    const names = angular({ compilation: 'ngp', liveReload: true }).map(
      (plugin) => plugin.name,
    );
    expect(names).toContain('@analogjs/vite-plugin-angular');
    expect(names).not.toContain('@analogjs/vite-plugin-angular-ngp');
  });

  it('preserves companion plugins without loading NGP', () => {
    const options = { jit: false, liveReload: true };
    const fastCompile = angular({ ...options, fastCompile: true }).map(
      (plugin) => plugin.name,
    );
    const ngp = angular({ ...options, compilation: 'ngp' }).map(
      (plugin) => plugin.name,
    );
    expect(ngp).toEqual(
      fastCompile.map((name) =>
        name === '@analogjs/vite-plugin-angular-fast-compile'
          ? '@analogjs/vite-plugin-angular-ngp'
          : name,
      ),
    );
  });

  it.each([{ jit: true }, { jit: false, fastCompileMode: 'partial' as const }])(
    'rejects unsupported NGP compilation options: %j',
    (options) => {
      expect(() => angular({ compilation: 'ngp', ...options })).toThrow(
        "requires jit: false and fastCompileMode: 'full'",
      );
    },
  );
});

describe('NGP dev server', () => {
  const tmp = resolve(import.meta.dirname, '../../../../tmp');
  let root: string;
  let server: ViteDevServer | undefined;

  afterEach(async () => {
    await server?.close();
    server = undefined;
    rmSync(root, { recursive: true, force: true });
  });

  it('recompiles the component after a template change', async () => {
    mkdirSync(tmp, { recursive: true });
    root = normalizePath(mkdtempSync(resolve(tmp, 'ngp-dev-')));
    writeFileSync(
      resolve(root, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: { strict: true, skipLibCheck: true, types: [] },
        files: ['app.ts'],
      }),
    );
    writeFileSync(
      resolve(root, 'app.ts'),
      `import { Component } from '@angular/core';

@Component({ selector: 'app-root', templateUrl: './app.html' })
export class App {}
`,
    );
    writeFileSync(resolve(root, 'app.html'), '<h1>Before</h1>');
    server = await createServer({
      configFile: false,
      root,
      logLevel: 'silent',
      server: { middlewareMode: true, ws: false, watch: null },
      optimizeDeps: { noDiscovery: true },
      plugins: angular({
        compilation: 'ngp',
        jit: false,
        disableTypeChecking: true,
        tsconfig: resolve(root, 'tsconfig.json'),
      }),
    });
    await server.transformRequest('/app.ts');
    const plugin = server.config.plugins.find(
      ({ name }) => name === '@analogjs/vite-plugin-angular-ngp',
    )!;
    writeFileSync(resolve(root, 'app.html'), '<h1>After</h1>');
    await (plugin.handleHotUpdate as any)({
      file: `${root}/app.html`,
      read: () => '<h1>After</h1>',
      server,
      modules: [],
      timestamp: Date.now(),
    });
    const { code } = (await server.transformRequest('/app.ts'))!;
    expect(code).toMatch(/ɵɵtext\(\d+, ["']After["']\)/);
  });
});
