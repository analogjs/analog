import { once } from 'node:events';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer as createHttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { resolve } from 'node:path';
import { createServer, normalizePath, type ViteDevServer } from 'vite';
import { afterEach, describe, expect, it, vi } from 'vitest';
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

describe('NGP component HMR', () => {
  const COMPILED_AFTER = /ɵɵtext\(\d+, ["']After["']\)/;
  const tmp = resolve(import.meta.dirname, '../../../../tmp');
  let root: string;
  let server: ViteDevServer | undefined;

  afterEach(async () => {
    await server?.close();
    server = undefined;
    rmSync(root, { recursive: true, force: true });
    vi.unstubAllEnvs();
  });

  const component = (member = '') => `import { Component } from '@angular/core';
import { Child } from './child';

@Component({
  selector: 'app-root',
  imports: [Child],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {${member}}
`;
  const child = `import { Component } from '@angular/core';

@Component({ selector: 'app-child', template: '<p>Before</p>' })
export class Child {}
`;

  async function serve(liveReload?: boolean) {
    mkdirSync(tmp, { recursive: true });
    root = normalizePath(mkdtempSync(resolve(tmp, 'ngp-hmr-')));
    writeFileSync(
      resolve(root, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: { strict: true, skipLibCheck: true, types: [] },
        files: ['app.ts'],
      }),
    );
    writeFileSync(resolve(root, 'app.ts'), component());
    writeFileSync(resolve(root, 'child.ts'), child);
    writeFileSync(resolve(root, 'app.html'), '<h1>Before</h1><app-child />');
    writeFileSync(
      resolve(root, 'app.scss'),
      "@use './vars'; h1 { color: vars.$color; }",
    );
    writeFileSync(resolve(root, '_vars.scss'), '$color: red;');
    // HMR is disabled under Vitest
    vi.stubEnv('VITEST', '');
    vi.stubEnv('NODE_ENV', 'development');
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
        liveReload,
      }),
    });
    const send = vi.spyOn(server.ws, 'send');
    const { code } = (await server.transformRequest('/app.ts'))!;
    const plugin = server.config.plugins.find(
      ({ name }) => name === '@analogjs/vite-plugin-angular-ngp',
    )!;
    const update = async (file: string, content: string) => {
      writeFileSync(resolve(root, file), content);
      await (plugin.handleHotUpdate as any)({
        file: `${root}/${file}`,
        read: () => content,
        server,
        modules: [],
        timestamp: Date.now(),
      });
    };
    return { code, send, update };
  }

  async function requestUpdate(componentId: string) {
    const http = createHttpServer(server!.middlewares).listen(0);
    await once(http, 'listening');
    try {
      const { port } = http.address() as AddressInfo;
      const response = await fetch(
        `http://localhost:${port}/@ng/component?c=${componentId}&t=1`,
      );
      return response.text();
    } finally {
      http.close();
    }
  }

  it('reloads the page by default', async () => {
    const { code, send, update } = await serve();
    expect(code).not.toContain('angular:component-update');
    await update('app.html', '<h1>After</h1><app-child />');
    expect(send).toHaveBeenCalledWith({ type: 'full-reload' });
  });

  it('recompiles the component after a template change', async () => {
    const { update } = await serve();
    await update('app.html', '<h1>After</h1><app-child />');
    const { code } = (await server!.transformRequest('/app.ts'))!;
    expect(code).toMatch(COMPILED_AFTER);
  });

  it.each([
    [
      'template file',
      'app.html',
      '<h1>After</h1><app-child />',
      COMPILED_AFTER,
    ],
    ['style dependency', '_vars.scss', '$color: blue;', /color: blue/],
    [
      'inline template',
      'app.ts',
      component().replace(
        "templateUrl: './app.html'",
        "template: '<h1>After</h1><app-child />'",
      ),
      COMPILED_AFTER,
    ],
  ])(
    'updates the component after a %s change',
    async (_, file, content, expected) => {
      const { code, send, update } = await serve(true);
      expect(code).toContain('angular:component-update');
      await update(file, content);
      const id = encodeURIComponent(`${root}/app.ts@App`);
      expect(send).toHaveBeenCalledWith('angular:component-update', {
        id,
        timestamp: expect.any(Number),
      });
      expect(send).not.toHaveBeenCalledWith({ type: 'full-reload' });
      expect(await requestUpdate(id)).toMatch(expected);
    },
    30_000,
  );

  it('passes local dependencies to the update module', async () => {
    const { update } = await serve(true);
    await update('app.html', '<h1>After</h1><app-child />');
    const id = encodeURIComponent(`${root}/app.ts@App`);
    expect(await requestUpdate(id)).toMatch(
      /function App_UpdateMetadata\(App, ɵɵnamespaces, [^)]*\bChild\b/,
    );
  });

  it('updates a component edited after another component in its chunk', async () => {
    const { send, update } = await serve(true);
    await update('app.html', '<h1>After</h1><app-child />');
    await update('child.ts', child.replace('Before', 'After'));
    const id = encodeURIComponent(`${root}/child.ts@Child`);
    expect(send).toHaveBeenCalledWith('angular:component-update', {
      id,
      timestamp: expect.any(Number),
    });
    expect(send).not.toHaveBeenCalledWith({ type: 'full-reload' });
    expect(await requestUpdate(id)).toMatch(COMPILED_AFTER);
  });

  it('reloads the page after a class member change', async () => {
    const { send, update } = await serve(true);
    await update('app.ts', component(" title = 'next';"));
    expect(send).toHaveBeenCalledWith({ type: 'full-reload' });
    expect(send).not.toHaveBeenCalledWith(
      'angular:component-update',
      expect.anything(),
    );
  });
});
