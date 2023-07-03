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
    expect(nitro({}).name).toEqual('@analogjs/vite-nitro-plugin');
  });

  it(`should not call the route middleware in test mode `, async () => {
    // Arrange
    const spy = vi.spyOn(mockViteDevServer.middlewares, 'use');

    // Act
    await (nitro({}).configureServer as any)(mockViteDevServer);

    // Assert
    expect(spy).toHaveBeenCalledTimes(0);
    expect(spy).not.toHaveBeenCalledWith('/api', expect.anything());
  });

  it('should build the server with prerender route "/" if nothing was provided', async () => {
    // Arrange
    const [buildSSRAppImportSpy, buildServerImportSpy, buildSitemapImportSpy] =
      await mockBuildFunctions();
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
        prerender: { routes: ['/'] },
        rollupConfig: expect.anything(),
        handlers: expect.anything(),
      }
    );
  });

  it('should build the server with prerender route "/" even if ssr is false', async () => {
    // Arrange
    const [buildSSRAppImportSpy, buildServerImportSpy, buildSitemapImportSpy] =
      await mockBuildFunctions();
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
        prerender: { routes: ['/'] },
        rollupConfig: expect.anything(),
        handlers: expect.anything(),
      }
    );
  });

  it('should build the server without prerender route when an empty array was passed', async () => {
    // Arrange
    const [buildSSRAppImportSpy, buildServerImportSpy, buildSitemapImportSpy] =
      await mockBuildFunctions();
    const prerenderRoutes = {
      prerender: {
        routes: [],
        sitemap: { domain: 'example.com' },
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
        rollupConfig: expect.anything(),
        handlers: expect.anything(),
      }
    );
    expect(buildSitemapImportSpy).toHaveBeenCalledWith(
      {},
      { domain: 'example.com' },
      prerenderRoutes.prerender.routes
    );
  });

  it('should build the server with provided routes', async () => {
    // Arrange
    const [buildSSRAppImportSpy, buildServerImportSpy, buildSitemapImportSpy] =
      await mockBuildFunctions();
    const prerenderRoutes = {
      prerender: {
        routes: ['/blog', '/about'],
        sitemap: { domain: 'example.com' },
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
        prerender: {
          routes: prerenderRoutes.prerender.routes,
        },
        rollupConfig: expect.anything(),
        handlers: expect.anything(),
      }
    );

    expect(buildSitemapImportSpy).toHaveBeenCalledWith(
      {},
      { domain: 'example.com' },
      prerenderRoutes.prerender.routes
    );
  });
});
