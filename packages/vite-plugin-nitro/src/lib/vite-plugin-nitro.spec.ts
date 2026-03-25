import { describe, expect, it, vi } from 'vitest';
import * as vite from 'vite';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

vi.mock('nitro/builder', () => ({
  build: vi.fn(),
  createDevServer: vi.fn(),
  createNitro: vi.fn(),
}));

vi.mock('./build-ssr', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./build-ssr')>();
  return {
    ...actual,
    buildClientApp: vi.fn(),
    buildSSRApp: vi.fn(),
  };
});

import { build, createDevServer, createNitro } from 'nitro/builder';
import { buildClientApp } from './build-ssr';
import {
  mockBuildFunctions,
  mockNitroConfig,
  mockViteDevServer,
  runConfigAndCloseBundle,
} from './vite-nitro-plugin.spec.data';
import { nitro } from './vite-plugin-nitro';

function writeBuiltClientIndexHtml(
  workspaceRoot: string,
  html = '<html></html>',
  clientBuildDir = resolve(workspaceRoot, 'dist', 'client'),
) {
  mkdirSync(clientBuildDir, { recursive: true });
  writeFileSync(resolve(clientBuildDir, 'index.html'), html);
}

describe('nitro', () => {
  vi.mock('./build-server');
  vi.mock('./build-sitemap');

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('should work', () => {
    expect(nitro({})[1].name).toEqual('@analogjs/vite-plugin-nitro');
  });

  it(`should not call the route middleware in test mode `, async () => {
    // Arrange
    const spy = vi.spyOn(mockViteDevServer.middlewares, 'use');

    // Act
    await (nitro({})[1].configureServer as any)(mockViteDevServer);

    // Assert
    expect(spy).toHaveBeenCalledTimes(0);
    expect(spy).not.toHaveBeenCalledWith('/api', expect.anything());
  });

  it('should initialize Nitro dev mode with renderer virtual modules', async () => {
    const nitroInstance = {} as never;
    const devServer = {
      fetch: vi.fn(),
      upgrade: vi.fn(),
    } as never;
    const use = vi.fn();
    const once = vi.fn();
    const on = vi.fn();

    vi.mocked(createNitro).mockResolvedValue(nitroInstance);
    vi.mocked(createDevServer).mockReturnValue(devServer);
    vi.mocked(build).mockResolvedValue(undefined as never);
    vi.stubEnv('VITEST', '');
    vi.stubEnv('NODE_ENV', 'development');

    const plugin = nitro({ ssr: true });
    await (plugin[1].config as any)(
      {},
      { command: 'serve', mode: 'development' },
    );

    const configureNitro = await (plugin[1].configureServer as any)({
      config: {
        root: '/workspace/app',
        server: {
          host: '127.0.0.1',
          port: 4300,
        },
      },
      httpServer: {
        once,
        on,
      },
      middlewares: {
        stack: [],
        use,
      },
      watcher: {
        on: vi.fn(),
      },
    });

    await configureNitro?.();

    expect(createNitro).toHaveBeenCalledWith(
      expect.objectContaining({
        builder: 'rollup',
        dev: true,
        virtual: expect.objectContaining({
          '#ANALOG_SSR_RENDERER': expect.stringContaining(
            "import template from '#analog/index';",
          ),
          '#ANALOG_CLIENT_RENDERER': expect.stringContaining(
            "import template from '#analog/index';",
          ),
        }),
      }),
    );
    expect(createDevServer).toHaveBeenCalledWith(nitroInstance);
    expect(build).toHaveBeenCalledWith(nitroInstance);
    expect(use).toHaveBeenCalled();
    expect(once).toHaveBeenCalledWith('listening', expect.any(Function));
    expect(on).not.toHaveBeenCalled();
  });

  it('should use the active Vite SSR bundler config key', async () => {
    const plugin = nitro({});
    const result = await (plugin[1].config as any)(
      {},
      { command: 'build', mode: 'production' },
    );
    const ssrBuild = result.environments.ssr.build;
    const activeKey = vite.rolldownVersion
      ? 'rolldownOptions'
      : 'rollupOptions';
    const inactiveKey = vite.rolldownVersion
      ? 'rollupOptions'
      : 'rolldownOptions';

    expect(ssrBuild).toHaveProperty(activeKey);
    expect(ssrBuild[activeKey]).toEqual(
      expect.objectContaining({
        input: expect.stringMatching(/src[\\/]+main\.server\.ts$/),
      }),
    );
    expect(ssrBuild.emptyOutDir).toBe(false);
    expect(ssrBuild).not.toHaveProperty(inactiveKey);
  });

  it.runIf(vite.rolldownVersion)(
    'should forward nested vite rolldown codeSplitting config to the client build (Rolldown)',
    async () => {
      const codeSplitting = {
        groups: [{ test: /node_modules/, name: 'vendor' }],
      };
      const plugin = nitro({
        vite: {
          build: {
            rolldownOptions: {
              output: {
                codeSplitting,
                entryFileNames: 'assets/[name].js',
              } as any,
            },
          },
        },
      });
      const result = await (plugin[1].config as any)(
        {},
        { command: 'build', mode: 'production' },
      );
      const clientBuild = result.environments.client.build;

      expect(clientBuild.rolldownOptions.output).toEqual(
        expect.objectContaining({
          codeSplitting,
          entryFileNames: 'assets/[name].js',
        }),
      );
    },
  );

  it.runIf(!vite.rolldownVersion)(
    'should not have rolldownOptions when not using Rolldown',
    async () => {
      const codeSplitting = {
        groups: [{ test: /node_modules/, name: 'vendor' }],
      };
      const plugin = nitro({
        vite: {
          build: {
            rolldownOptions: {
              output: {
                codeSplitting,
                entryFileNames: 'assets/[name].js',
              } as any,
            },
          },
        },
      });
      const result = await (plugin[1].config as any)(
        {},
        { command: 'build', mode: 'production' },
      );
      const clientBuild = result.environments.client.build;

      expect(clientBuild).not.toHaveProperty('rolldownOptions');
    },
  );

  it.runIf(vite.rolldownVersion)(
    'should ignore codeSplitting forwarding when rolldown output is an array',
    async () => {
      const plugin = nitro({
        vite: {
          build: {
            rolldownOptions: {
              output: [{ entryFileNames: 'assets/[name].js' }] as any,
            },
          },
        },
      });
      const result = await (plugin[1].config as any)(
        {},
        { command: 'build', mode: 'production' },
      );
      const clientBuild = result.environments.client.build;

      expect(clientBuild.rolldownOptions).toBeUndefined();
    },
  );

  it('should strip Rolldown-only codeSplitting from Nitro rollup builds', async () => {
    const { buildServerImportSpy } = await mockBuildFunctions();
    const workspaceRoot = mkdtempSync(join(tmpdir(), 'analog-nitro-'));

    try {
      const ssrBuildDir = resolve(workspaceRoot, 'dist', 'ssr');
      const builtSsrEntry = resolve(ssrBuildDir, 'main.server.js');
      mkdirSync(ssrBuildDir, { recursive: true });
      writeFileSync(
        builtSsrEntry,
        'export default async function renderer() {}',
      );
      writeBuiltClientIndexHtml(workspaceRoot, '<html>rollup build</html>');

      const plugin = nitro({
        workspaceRoot,
        ssrBuildDir,
      });
      const result = await (plugin[1].config as any)(
        {},
        { command: 'build', mode: 'production' },
      );
      await result.builder.buildApp({
        build: vi.fn().mockResolvedValue(undefined),
        environments: {
          client: {},
          ssr: {},
        },
      });

      const nitroConfig = buildServerImportSpy.mock.calls[0][1];
      const bundlerConfig = {
        output: {
          codeSplitting: { groups: [{ test: /node_modules/, name: 'vendor' }] },
          entryFileNames: 'index.mjs',
        },
      };

      await nitroConfig.hooks['rollup:before']({}, bundlerConfig);

      expect(bundlerConfig.output).toEqual({
        entryFileNames: 'index.mjs',
      });
      expect(nitroConfig.virtual?.['#analog/index']).toBe(
        'export default "<html>rollup build</html>";',
      );
    } finally {
      rmSync(workspaceRoot, { recursive: true, force: true });
    }
  });

  it('should alias the built SSR entry for Nitro server builds', async () => {
    const { buildServerImportSpy } = await mockBuildFunctions();
    const workspaceRoot = mkdtempSync(join(tmpdir(), 'analog-nitro-'));

    try {
      const ssrBuildDir = resolve(workspaceRoot, 'dist', 'demo', 'ssr');
      const builtSsrEntry = resolve(ssrBuildDir, 'main.server.js');
      mkdirSync(ssrBuildDir, { recursive: true });
      writeFileSync(
        builtSsrEntry,
        'export default async function renderer() {}',
      );
      writeBuiltClientIndexHtml(workspaceRoot, '<html>ssr alias</html>');

      const plugin = nitro({
        ssr: true,
        workspaceRoot,
        ssrBuildDir,
      });
      const result = await (plugin[1].config as any)(
        {},
        { command: 'build', mode: 'production' },
      );

      await result.builder.buildApp({
        build: vi.fn().mockResolvedValue(undefined),
        environments: {
          client: {},
          ssr: {},
        },
      });

      const nitroConfig = buildServerImportSpy.mock.calls[0][1];
      const expectedAlias = vite.normalizePath(builtSsrEntry);

      expect(nitroConfig.alias).toEqual(
        expect.objectContaining({
          '#analog/ssr': expectedAlias,
        }),
      );
      expect(nitroConfig.virtual?.['#ANALOG_SSR_RENDERER']).toContain(
        "import renderer from '#analog/ssr';",
      );
      expect(nitroConfig.virtual?.['#analog/index']).toBe(
        'export default "<html>ssr alias</html>";',
      );
    } finally {
      rmSync(workspaceRoot, { recursive: true, force: true });
    }
  });

  it('passes only canonical page routes to sitemap generation in builder.buildApp', async () => {
    const { buildSitemapImportSpy } = await mockBuildFunctions();
    const workspaceRoot = mkdtempSync(join(tmpdir(), 'analog-nitro-'));

    try {
      const ssrBuildDir = resolve(workspaceRoot, 'dist', 'ssr');
      mkdirSync(ssrBuildDir, { recursive: true });
      writeFileSync(
        resolve(ssrBuildDir, 'main.server.js'),
        'export default async function renderer() {}',
      );
      writeBuiltClientIndexHtml(workspaceRoot, '<html>sitemap buildApp</html>');

      const plugin = nitro({
        workspaceRoot,
        prerender: {
          sitemap: { host: 'https://example.com' },
          routes: [
            '/about',
            {
              route: '/blog',
              staticData: true,
              sitemap: {
                lastmod: '2024-02-10',
              },
            },
          ],
        },
      });
      const result = await (plugin[1].config as any)(
        {},
        { command: 'build', mode: 'production' },
      );

      await result.builder.buildApp({
        build: vi.fn().mockResolvedValue(undefined),
        environments: {
          client: {},
          ssr: {},
        },
      });

      expect(buildSitemapImportSpy).toHaveBeenCalledWith(
        {},
        { host: 'https://example.com' },
        ['/about', '/blog'],
        resolve(workspaceRoot, 'dist', 'analog', 'public'),
        {
          '/blog': { lastmod: '2024-02-10' },
        },
        { apiPrefix: 'api' },
      );
    } finally {
      rmSync(workspaceRoot, { recursive: true, force: true });
    }
  });

  it('should resolve client output path correctly for nested roots without explicit build.outDir', async () => {
    const { buildServerImportSpy } = await mockBuildFunctions();
    const workspaceRoot = mkdtempSync(join(tmpdir(), 'analog-nitro-'));

    try {
      const nestedRoot = 'apps/my-app';
      const ssrBuildDir = resolve(workspaceRoot, 'dist', nestedRoot, 'ssr');
      const builtSsrEntry = resolve(ssrBuildDir, 'main.server.js');
      mkdirSync(ssrBuildDir, { recursive: true });
      writeFileSync(
        builtSsrEntry,
        'export default async function renderer() {}',
      );

      // The client build emits to <workspace>/dist/<root>/client when no
      // explicit build.outDir is set — write index.html there.
      const clientBuildDir = resolve(
        workspaceRoot,
        'dist',
        nestedRoot,
        'client',
      );
      mkdirSync(clientBuildDir, { recursive: true });
      writeFileSync(
        resolve(clientBuildDir, 'index.html'),
        '<html>nested root</html>',
      );

      // Create the nested app source directory so the plugin can resolve it.
      mkdirSync(resolve(workspaceRoot, nestedRoot, 'src/server'), {
        recursive: true,
      });

      const plugin = nitro({
        workspaceRoot,
        ssrBuildDir,
      });
      const result = await (plugin[1].config as any)(
        { root: nestedRoot },
        { command: 'build', mode: 'production' },
      );
      await result.builder.buildApp({
        build: vi.fn().mockResolvedValue(undefined),
        environments: {
          client: {},
          ssr: {},
        },
      });

      const nitroConfig = buildServerImportSpy.mock.calls[0][1];

      // registerIndexHtmlVirtual must read index.html from
      // <workspace>/dist/<root>/client — not <workspace>/<root>/dist/client.
      expect(nitroConfig.virtual?.['#analog/index']).toBe(
        'export default "<html>nested root</html>";',
      );
    } finally {
      rmSync(workspaceRoot, { recursive: true, force: true });
    }
  });

  it('uses the finalized client environment outDir during builder.buildApp', async () => {
    const { buildServerImportSpy } = await mockBuildFunctions();
    const workspaceRoot = mkdtempSync(join(tmpdir(), 'analog-nitro-'));

    try {
      const nestedRoot = 'apps/my-app';
      const ssrBuildDir = resolve(workspaceRoot, 'dist', nestedRoot, 'ssr');
      const builtSsrEntry = resolve(ssrBuildDir, 'main.server.js');
      const staleClientDir = resolve(
        workspaceRoot,
        'dist',
        nestedRoot,
        'client',
      );
      const finalClientDir = resolve(
        workspaceRoot,
        'dist',
        nestedRoot,
        'client-final',
      );

      mkdirSync(ssrBuildDir, { recursive: true });
      writeFileSync(
        builtSsrEntry,
        'export default async function renderer() {}',
      );
      writeBuiltClientIndexHtml(
        workspaceRoot,
        '<html>finalized client env</html>',
        finalClientDir,
      );
      mkdirSync(resolve(workspaceRoot, nestedRoot, 'src/server'), {
        recursive: true,
      });

      const plugin = nitro({
        workspaceRoot,
        ssrBuildDir,
      });
      const result = await (plugin[1].config as any)(
        {
          root: nestedRoot,
          build: {
            outDir: '../../dist/apps/my-app/client',
          },
        },
        { command: 'build', mode: 'production' },
      );

      await result.builder.buildApp({
        build: vi.fn().mockResolvedValue(undefined),
        environments: {
          client: {
            config: {
              build: {
                outDir: '../../dist/apps/my-app/client-final',
              },
            },
          },
          ssr: {},
        },
      });

      const nitroConfig = buildServerImportSpy.mock.calls[0][1];

      expect(nitroConfig.virtual?.['#analog/index']).toBe(
        'export default "<html>finalized client env</html>";',
      );
      expect(nitroConfig.publicAssets).toEqual([
        {
          dir: vite.normalizePath(finalClientDir),
          maxAge: 0,
        },
      ]);
      expect(nitroConfig.publicAssets).not.toEqual([
        {
          dir: vite.normalizePath(staleClientDir),
          maxAge: 0,
        },
      ]);
    } finally {
      rmSync(workspaceRoot, { recursive: true, force: true });
    }
  });

  it('falls back to the captured client index asset during closeBundle', async () => {
    const { buildServerImportSpy } = await mockBuildFunctions();
    const workspaceRoot = mkdtempSync(join(tmpdir(), 'analog-nitro-'));

    try {
      const ssrBuildDir = resolve(workspaceRoot, 'dist', 'ssr');
      mkdirSync(ssrBuildDir, { recursive: true });
      writeFileSync(
        resolve(ssrBuildDir, 'main.server.js'),
        'export default async function renderer() {}',
      );

      const plugin = nitro({
        workspaceRoot,
        ssrBuildDir,
      });

      await (plugin[1].config as any)(
        {},
        { command: 'build', mode: 'production' },
      );

      await (plugin[1].generateBundle as any)(
        {},
        {
          'index.html': {
            type: 'asset',
            fileName: 'index.html',
            source: '<html>captured bundle asset</html>',
          },
        },
      );

      await (plugin[1].closeBundle as any)();

      const nitroConfig = buildServerImportSpy.mock.calls[0][1];
      expect(nitroConfig.virtual?.['#analog/index']).toBe(
        'export default "<html>captured bundle asset</html>";',
      );
    } finally {
      rmSync(workspaceRoot, { recursive: true, force: true });
    }
  });

  it('rebuilds the client output during closeBundle when index.html is missing', async () => {
    const { buildServerImportSpy } = await mockBuildFunctions();
    const workspaceRoot = mkdtempSync(join(tmpdir(), 'analog-nitro-'));

    try {
      const ssrBuildDir = resolve(workspaceRoot, 'dist', 'ssr');
      mkdirSync(ssrBuildDir, { recursive: true });
      writeFileSync(
        resolve(ssrBuildDir, 'main.server.js'),
        'export default async function renderer() {}',
      );

      vi.mocked(buildClientApp).mockImplementation(async () => {
        writeBuiltClientIndexHtml(
          workspaceRoot,
          '<html>rebuilt client output</html>',
        );
      });

      const plugin = nitro({
        workspaceRoot,
      });

      await (plugin[1].config as any)(
        {
          root: '.',
          build: {
            outDir: 'dist/client',
          },
        },
        { command: 'build', mode: 'production' },
      );

      await (plugin[1].closeBundle as any)();

      expect(buildClientApp).toHaveBeenCalledWith(
        expect.objectContaining({
          build: expect.objectContaining({
            outDir: 'dist/client',
          }),
        }),
        expect.objectContaining({
          workspaceRoot,
        }),
      );

      const nitroConfig = buildServerImportSpy.mock.calls[0][1];
      expect(nitroConfig.virtual?.['#analog/index']).toBe(
        'export default "<html>rebuilt client output</html>";',
      );
    } finally {
      rmSync(workspaceRoot, { recursive: true, force: true });
    }
  });

  describe.skip('preset output', () => {
    it('should use the analog output paths when preset is not vercel', async () => {
      // Arrange
      vi.mock('process');
      process.cwd = vi.fn().mockReturnValue('/custom-root-directory');
      const { buildServerImportSpy } = await mockBuildFunctions();

      const plugin = nitro({}, {});

      // Act
      await runConfigAndCloseBundle(plugin);

      // Assert
      expect(buildServerImportSpy).toHaveBeenCalledWith(
        {},
        expect.objectContaining({
          output: {
            dir: '/custom-root-directory/dist/analog',
            publicDir: '/custom-root-directory/dist/analog/public',
          },
        }),
      );
    });

    it('should use the workspace root option when it is set', async () => {
      // Arrange
      vi.mock('process');
      process.cwd = vi.fn().mockReturnValue('/some-other-root-directory');
      const { buildServerImportSpy } = await mockBuildFunctions();

      const plugin = nitro({ workspaceRoot: '/custom-root-directory' }, {});

      // Act
      await runConfigAndCloseBundle(plugin);

      // Assert
      expect(buildServerImportSpy).toHaveBeenCalledWith(
        { workspaceRoot: '/custom-root-directory' },
        expect.objectContaining({
          output: {
            dir: '/custom-root-directory/some-other-root-directory/analog',
            publicDir:
              '/custom-root-directory/some-other-root-directory/analog/public',
          },
        }),
      );
    });

    it('should use the .vercel output paths when preset is vercel', async () => {
      // Arrange
      vi.mock('process');
      process.cwd = vi.fn().mockReturnValue('/custom-root-directory');
      const { buildServerImportSpy } = await mockBuildFunctions();

      const plugin = nitro({}, { preset: 'vercel' });

      // Act
      await runConfigAndCloseBundle(plugin);

      // Assert
      expect(buildServerImportSpy).toHaveBeenCalledWith(
        {},
        expect.objectContaining({
          preset: 'vercel',
          output: {
            dir: '/custom-root-directory/.vercel/output',
            publicDir: '/custom-root-directory/.vercel/output/static',
          },
          vercel: expect.objectContaining({
            entryFormat: 'node',
            functions: expect.objectContaining({
              runtime: 'nodejs24.x',
            }),
          }),
        }),
      );
    });

    it('should use the .vercel output paths without runtime config when preset is vercel', async () => {
      // Arrange
      vi.mock('process');
      process.cwd = vi.fn().mockReturnValue('/custom-root-directory');
      const { buildServerImportSpy } = await mockBuildFunctions();

      const plugin = nitro({}, { preset: 'vercel' });

      // Act
      await runConfigAndCloseBundle(plugin);

      // Assert
      expect(buildServerImportSpy).toHaveBeenCalledWith(
        {},
        expect.objectContaining({
          preset: 'vercel',
          output: {
            dir: '/custom-root-directory/.vercel/output',
            publicDir: '/custom-root-directory/.vercel/output/static',
          },
        }),
      );
    });

    it('should use the .vercel output paths when preset is VERCEL environment variable is set', async () => {
      // Arrange
      vi.stubEnv('VERCEL', '1');
      vi.mock('process');
      process.cwd = vi.fn().mockReturnValue('/custom-root-directory');
      const { buildServerImportSpy } = await mockBuildFunctions();

      const plugin = nitro({}, {});

      // Act
      await runConfigAndCloseBundle(plugin);

      // Assert
      expect(buildServerImportSpy).toHaveBeenCalledWith(
        {},
        expect.objectContaining({
          preset: 'vercel',
          output: {
            dir: '/custom-root-directory/.vercel/output',
            publicDir: '/custom-root-directory/.vercel/output/static',
          },
          vercel: expect.objectContaining({
            entryFormat: 'node',
            functions: expect.objectContaining({
              runtime: 'nodejs24.x',
            }),
          }),
        }),
      );
    });
  });
});
