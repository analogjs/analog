import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer as createHttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { Plugin } from 'vite';
import { createServer, normalizePath } from 'vite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { serverPlugin } from './server-plugin';

type Hooks = {
  config: (config: object, env: { command: string }) => unknown;
  writeBundle: (this: unknown, options: object, bundle: object) => void;
  transform: { handler: (code: string, id: string) => string | undefined };
};

const files: Record<string, string> = {
  'src/main.server.ts': 'export default () => "";',
  'src/app/app.config.server.ts': 'export const config = {};',
  'src/app/pages/users/[id].server.ts': 'export const load = () => ({});',
  'src/app/fns/shout.server.ts': [
    "import { serverFn } from '@analogjs/router/server';",
    'export const shout = serverFn(async () => ({}));',
  ].join('\n'),
};

describe('serverPlugin', () => {
  let root: string;

  beforeEach(() => {
    root = normalizePath(mkdtempSync(join(tmpdir(), 'analog-server-')));
    for (const [file, code] of Object.entries(files)) {
      mkdirSync(dirname(join(root, file)), { recursive: true });
      writeFileSync(join(root, file), code);
    }
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function setup(command: string) {
    const plugin = serverPlugin(
      { entry: 'src/server/main.ts' },
      { workspaceRoot: root, apiPrefix: 'services' },
    ) as Plugin & Hooks;
    const config = plugin.config({ root }, { command });
    return { plugin, config };
  }

  function evaluateManifest(plugin: Hooks) {
    const code = plugin.transform.handler(
      'const ANALOG_SERVER_MANIFEST = {};',
      '/router-server.mjs',
    )!;
    return new Function(
      `return ${code.slice('const ANALOG_SERVER_MANIFEST = '.length, -1)}`,
    )();
  }

  it('fills in the manifest from the app', async () => {
    const { plugin } = setup('serve');
    const manifest = evaluateManifest(plugin);

    expect(manifest.apiPrefix).toBe('services');
    expect(Object.keys(manifest.pageEndpoints)).toEqual([
      '/services/_analog/pages/users/:id',
    ]);
    expect(manifest.serverFnModules).toHaveLength(1);
    expect(manifest.render.toString()).toContain(`${root}/src/main.server.ts`);
    expect(manifest.config.toString()).toContain(
      `${root}/src/app/app.config.server.ts`,
    );
  });

  it('resolves a relative entryServer against the root', () => {
    const plugin = serverPlugin(
      { entry: 'src/server/main.ts' },
      { workspaceRoot: root, entryServer: 'src/main.server.stream.ts' },
    ) as Plugin & Hooks;
    plugin.config({ root }, { command: 'serve' });

    expect(evaluateManifest(plugin).render.toString()).toContain(
      `"${root}/src/main.server.stream.ts"`,
    );
  });

  it('renders around the built document in a build', async () => {
    const { plugin } = setup('build');
    plugin.writeBundle.call(
      { environment: { name: 'client' } },
      {},
      { 'index.html': { type: 'asset', source: '<html>built</html>' } },
    );

    expect(await evaluateManifest(plugin).template('/')).toBe(
      '<html>built</html>',
    );
  });

  it('fails a build when the client build emitted no document', () => {
    const { plugin } = setup('build');

    expect(() => evaluateManifest(plugin)).toThrow(/didn't emit index.html/);
  });

  it('builds the client, then the server entry', () => {
    const { config } = setup('build') as {
      config: {
        environments: Record<
          string,
          { build: { outDir: string; rollupOptions: { input: unknown } } }
        >;
      };
    };

    expect(config.environments['ssr'].build.rollupOptions.input).toEqual({
      main: join(root, 'src/server/main.ts'),
    });
    expect(config.environments['client'].build.outDir).toBe(
      join(root, 'dist/client'),
    );
  });

  it('defines the API prefix and locales the router reads', async () => {
    writeFileSync(
      join(root, 'src/values.js'),
      'export default [ANALOG_API_PREFIX, ANALOG_I18N_DEFAULT_LOCALE, ANALOG_I18N_LOCALES];',
    );
    const server = await createServer({
      root,
      configFile: false,
      logLevel: 'silent',
      server: { middlewareMode: true, ws: false },
      plugins: [
        serverPlugin(
          { entry: 'src/server/main.ts' },
          {
            workspaceRoot: root,
            apiPrefix: 'services',
            i18n: { defaultLocale: 'en', locales: ['en', 'fr'] },
          },
        ),
      ],
    });
    try {
      const values = await server.ssrLoadModule('/src/values.js');
      expect(values['default']).toEqual(['services', 'en', ['en', 'fr']]);
    } finally {
      await server.close();
    }
  });

  it('serves a Fetchable entry in dev and closes it on reload', async () => {
    writeFileSync(
      join(root, 'src/main.ts'),
      [
        'export default {',
        '  async fetch(request) {',
        '    const { pathname } = new URL(request.url);',
        '    const body = `${request.method} ${pathname} ${await request.text()}`;',
        "    return new Response(body, { status: 201, headers: { 'x-entry': 'fetchable' } });",
        '  },',
        '  close() {',
        '    globalThis.analogClosed = (globalThis.analogClosed ?? 0) + 1;',
        '  },',
        '};',
      ].join('\n'),
    );
    const vite = await createServer({
      root,
      configFile: false,
      logLevel: 'silent',
      server: { middlewareMode: true, ws: false },
      plugins: [
        serverPlugin({ entry: 'src/main.ts' }, { workspaceRoot: root }),
      ],
    });
    const http = createHttpServer(vite.middlewares).listen(0);
    try {
      const { port } = http.address() as AddressInfo;
      const response = await fetch(`http://localhost:${port}/services/echo`, {
        method: 'POST',
        body: 'hello',
      });
      expect(response.status).toBe(201);
      expect(response.headers.get('x-entry')).toBe('fetchable');
      expect(await response.text()).toBe('POST /services/echo hello');

      vite.environments['ssr'].moduleGraph.invalidateAll();
      await fetch(`http://localhost:${port}/services/echo`);
      await new Promise((resolve) => setImmediate(resolve));
      expect(globalThis).toHaveProperty('analogClosed', 1);
    } finally {
      delete (globalThis as { analogClosed?: number }).analogClosed;
      http.close();
      await vite.close();
    }
  });

  it('refuses to require locale workers', () => {
    const plugin = serverPlugin(
      { entry: 'src/server/main.ts' },
      { i18n: { defaultLocale: 'en', locales: ['en', 'fr'], workers: true } },
    ) as Plugin & Hooks;

    expect(() => plugin.config({ root }, { command: 'build' })).toThrow(
      /`i18n.workers` needs Nitro/,
    );
  });

  it('refuses to run alongside nitro()', () => {
    const plugin = serverPlugin({ entry: 'src/server/main.ts' }) as Plugin &
      Hooks;

    expect(() =>
      plugin.config(
        { root, plugins: [[{ name: '@analogjs/vite-plugin-nitro' }]] },
        { command: 'build' },
      ),
    ).toThrow(/remove `nitro\(\)`/);
  });
});
