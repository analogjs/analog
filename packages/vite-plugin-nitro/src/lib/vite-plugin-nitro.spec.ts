import { describe, expect, it, vi } from 'vitest';
import { nitro } from './vite-plugin-nitro';
import {
  mockBuildFunctions,
  mockNitroConfig,
  mockViteDevServer,
  runConfigAndCloseBundle,
} from './vite-nitro-plugin.spec.data';

describe('nitro', () => {
  vi.mock('./build-ssr');
  vi.mock('./build-server');
  vi.mock('./build-sitemap');

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should work', () => {
    expect(nitro({})[1].name).toEqual('@analogjs/vite-nitro-plugin');
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

  it('should build the server with prerender route "/" if nothing was provided', async () => {
    // Arrange
    const {
      buildSSRAppImportSpy,
      buildServerImportSpy,
      buildSitemapImportSpy,
    } = await mockBuildFunctions();
    const plugin = nitro({
      ssr: true,
    });

    // Act
    await runConfigAndCloseBundle(plugin);

    // Assert
    expect(buildSSRAppImportSpy).toHaveBeenCalledWith({}, { ssr: true });
    expect(buildSitemapImportSpy).not.toHaveBeenCalled();
    expect(buildServerImportSpy).toHaveBeenCalledWith(
      { ssr: true },
      {
        ...mockNitroConfig,
        alias: expect.anything(),
        prerender: { routes: ['/'] },
        rollupConfig: expect.anything(),
        handlers: expect.anything(),
      }
    );
  });

  it('should build the server with prerender route "/" even if ssr is false', async () => {
    // Arrange
    const {
      buildSSRAppImportSpy,
      buildServerImportSpy,
      buildSitemapImportSpy,
    } = await mockBuildFunctions();
    const plugin = nitro({
      ssr: false,
    });

    // Act
    await runConfigAndCloseBundle(plugin);

    // Assert
    expect(buildSSRAppImportSpy).not.toHaveBeenCalled();
    expect(buildSitemapImportSpy).not.toHaveBeenCalled();
    expect(buildServerImportSpy).toHaveBeenCalledWith(
      { ssr: false },
      {
        ...mockNitroConfig,
        alias: expect.anything(),
        prerender: { routes: ['/'] },
        rollupConfig: expect.anything(),
        handlers: expect.anything(),
      }
    );
  });

  it('should build the server without prerender route when an empty array was passed', async () => {
    // Arrange
    const {
      buildSSRAppImportSpy,
      buildServerImportSpy,
      buildSitemapImportSpy,
    } = await mockBuildFunctions();
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
    expect(buildSSRAppImportSpy).toHaveBeenCalledWith(
      {},
      { ssr: true, ...prerenderRoutes }
    );
    expect(buildServerImportSpy).toHaveBeenCalledWith(
      { ssr: true, ...prerenderRoutes },
      {
        ...mockNitroConfig,
        alias: expect.anything(),
        rollupConfig: expect.anything(),
        handlers: expect.anything(),
      }
    );
    expect(buildSitemapImportSpy).toHaveBeenCalledWith(
      {},
      { host: 'example.com' },
      prerenderRoutes.prerender.routes
    );
  });

  it('should build the server with provided routes', async () => {
    // Arrange
    const {
      buildSSRAppImportSpy,
      buildServerImportSpy,
      buildSitemapImportSpy,
    } = await mockBuildFunctions();
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
    expect(buildSSRAppImportSpy).toHaveBeenCalledWith(
      {},
      { ssr: true, ...prerenderRoutes }
    );

    expect(buildServerImportSpy).toHaveBeenCalledWith(
      { ssr: true, ...prerenderRoutes },
      {
        ...mockNitroConfig,
        alias: expect.anything(),
        prerender: {
          routes: prerenderRoutes.prerender.routes,
        },
        rollupConfig: expect.anything(),
        handlers: expect.anything(),
      }
    );

    expect(buildSitemapImportSpy).toHaveBeenCalledWith(
      {},
      { host: 'example.com' },
      prerenderRoutes.prerender.routes
    );
  });

  describe('preset output', () => {
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
        })
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
          output: {
            dir: '/custom-root-directory/.vercel/output',
            publicDir: '/custom-root-directory/.vercel/output/static',
          },
        })
      );
    });

    it('should use the .vercel output paths when preset is vercel-edge', async () => {
      // Arrange
      vi.mock('process');
      process.cwd = vi.fn().mockReturnValue('/custom-root-directory');
      const { buildServerImportSpy } = await mockBuildFunctions();

      const plugin = nitro({}, { preset: 'vercel-edge' });

      // Act
      await runConfigAndCloseBundle(plugin);

      // Assert
      expect(buildServerImportSpy).toHaveBeenCalledWith(
        {},
        expect.objectContaining({
          output: {
            dir: '/custom-root-directory/.vercel/output',
            publicDir: '/custom-root-directory/.vercel/output/static',
          },
        })
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
          output: {
            dir: '/custom-root-directory/.vercel/output',
            publicDir: '/custom-root-directory/.vercel/output/static',
          },
        })
      );
    });
  });
});
