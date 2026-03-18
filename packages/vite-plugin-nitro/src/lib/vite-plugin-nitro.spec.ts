import { describe, expect, it, vi } from 'vitest';
import * as vite from 'vite';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

import { PrerenderContentFile } from './options';
import {
  mockBuildFunctions,
  mockNitroConfig,
  mockViteDevServer,
  runConfigAndCloseBundle,
} from './vite-nitro-plugin.spec.data';
import { nitro } from './vite-plugin-nitro';

describe('nitro', () => {
  vi.mock('./build-ssr');
  vi.mock('./build-server');
  vi.mock('./build-sitemap');

  afterEach(() => {
    vi.restoreAllMocks();
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
      const expectedAlias =
        process.platform === 'win32'
          ? pathToFileURL(builtSsrEntry).href
          : vite.normalizePath(builtSsrEntry);

      expect(nitroConfig.alias).toEqual(
        expect.objectContaining({
          '#analog/ssr': expectedAlias,
        }),
      );
      expect(nitroConfig.virtual?.['#ANALOG_SSR_RENDERER']).toContain(
        "import renderer from '#analog/ssr';",
      );
    } finally {
      rmSync(workspaceRoot, { recursive: true, force: true });
    }
  });

  describe.skip('when prerendering is configured...', () => {
    it('should build the server with prerender route "/" if nothing was provided', async () => {
      // Arrange
      const { buildServerImportSpy, buildSitemapImportSpy } =
        await mockBuildFunctions();
      const plugin = nitro({
        ssr: true,
      });

      // Act
      await runConfigAndCloseBundle(plugin);

      // Assert
      expect(buildSitemapImportSpy).not.toHaveBeenCalled();
      expect(buildServerImportSpy).toHaveBeenCalledWith(
        { ssr: true },
        {
          ...mockNitroConfig,
          alias: expect.anything(),
          prerender: { routes: ['/'] },
          rollupConfig: expect.anything(),
          handlers: expect.arrayContaining([
            expect.objectContaining({ route: '/**', lazy: true }),
          ]),
          publicAssets: expect.anything(),
          serverAssets: expect.anything(),
        },
      );
    });

    it('should build the server with prerender route "/" even if ssr is false', async () => {
      // Arrange
      const { buildServerImportSpy, buildSitemapImportSpy } =
        await mockBuildFunctions();
      const plugin = nitro({
        ssr: false,
      });

      // Act
      await runConfigAndCloseBundle(plugin);

      // Assert
      expect(buildSitemapImportSpy).not.toHaveBeenCalled();
      expect(buildServerImportSpy).toHaveBeenCalledWith(
        { ssr: false },
        {
          ...mockNitroConfig,
          prerender: { routes: ['/'] },
          alias: expect.anything(),
          rollupConfig: expect.anything(),
          handlers: expect.arrayContaining([
            expect.objectContaining({ route: '/**', lazy: true }),
          ]),
          publicAssets: expect.anything(),
          serverAssets: expect.anything(),
        },
      );
    });

    it('should build the server without prerender route when an empty array was passed', async () => {
      // Arrange
      const { buildServerImportSpy, buildSitemapImportSpy } =
        await mockBuildFunctions();
      const prerenderRoutes = {
        prerender: {
          routes: [],
          sitemap: { host: 'example.com' },
        },
      };
      const plugin = nitro({
        ssr: true,
        ...prerenderRoutes,
      });

      // Act
      await runConfigAndCloseBundle(plugin);

      // Assert
      expect(buildServerImportSpy).toHaveBeenCalledWith(
        { ssr: true, ...prerenderRoutes },
        {
          ...mockNitroConfig,
          alias: expect.anything(),
          rollupConfig: expect.anything(),
          handlers: expect.arrayContaining([
            expect.objectContaining({ route: '/**', lazy: true }),
          ]),
          preset: undefined,
          prerender: {
            ...mockNitroConfig.prerender,
            routes: [],
          },
          publicAssets: expect.anything(),
          serverAssets: expect.anything(),
        },
      );
      expect(buildSitemapImportSpy).not.toHaveBeenCalled();
    });

    it('should build the server with provided routes', async () => {
      // Arrange
      const { buildServerImportSpy, buildSitemapImportSpy } =
        await mockBuildFunctions();
      const prerenderRoutes = {
        prerender: {
          routes: ['/blog', '/about'],
          sitemap: { host: 'example.com' },
        },
      };
      const plugin = nitro({
        ssr: true,
        ...prerenderRoutes,
      });

      // Act
      await runConfigAndCloseBundle(plugin);

      // Assert
      expect(buildServerImportSpy).toHaveBeenCalledWith(
        { ssr: true, ...prerenderRoutes },
        {
          ...mockNitroConfig,
          prerender: {
            routes: prerenderRoutes.prerender.routes,
          },
          alias: expect.anything(),
          rollupConfig: expect.anything(),
          handlers: expect.arrayContaining([
            expect.objectContaining({ route: '/**', lazy: true }),
          ]),
          publicAssets: expect.anything(),
          serverAssets: expect.anything(),
        },
      );

      expect(buildSitemapImportSpy).toHaveBeenCalledWith(
        {},
        { host: 'example.com' },
        prerenderRoutes.prerender.routes,
        expect.anything(),
      );
    });

    describe('should build the server with content dir routes', () => {
      [
        '/packages/vite-plugin-nitro/test-data/content',
        'packages/vite-plugin-nitro/test-data/content',
      ].forEach((contentDir) => {
        it(`contentDir: ${contentDir}`, async () => {
          // Arrange
          const { buildServerImportSpy, buildSitemapImportSpy } =
            await mockBuildFunctions();
          const prerenderRoutes = {
            prerender: {
              routes: [
                '/blog',
                '/about',
                {
                  contentDir,
                  transform: (file: PrerenderContentFile) => {
                    if (file.attributes['draft']) {
                      return false;
                    }
                    const slug = file.attributes['slug'] || file.name;
                    return `/blog/${slug}`;
                  },
                },
              ],
              sitemap: { host: 'example.com' },
            },
          };
          const plugin = nitro({
            ssr: true,
            ...prerenderRoutes,
          });

          // Act
          await runConfigAndCloseBundle(plugin);

          // Assert
          expect(buildServerImportSpy).toHaveBeenCalledWith(
            { ssr: true, ...prerenderRoutes },
            {
              ...mockNitroConfig,
              prerender: {
                routes: ['/blog', '/about', '/blog/first', '/blog/02-second'],
                crawlLinks: undefined,
              },
              alias: expect.anything(),
              publicAssets: expect.anything(),
              rollupConfig: expect.anything(),
              handlers: expect.arrayContaining([
                expect.objectContaining({ route: '/**', lazy: true }),
              ]),
              serverAssets: expect.anything(),
            },
          );

          expect(buildSitemapImportSpy).toHaveBeenCalledWith(
            {},
            { host: 'example.com' },
            ['/blog', '/about', '/blog/first', '/blog/02-second'],
            expect.anything(),
          );
        });
      });
    });
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
