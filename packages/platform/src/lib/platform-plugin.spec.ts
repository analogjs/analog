import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  viteNitroPluginSpy,
  angularSpy,
  ssrBuildPluginSpy,
  injectHTMLPluginSpy,
  depsPluginSpy,
  routerPluginSpy,
  routeGenerationPluginSpy,
  contentPluginSpy,
  serverModePluginSpy,
  clearClientPageEndpointsPluginSpy,
  discoverLibraryRoutesSpy,
  resolveStylePipelinePluginsSpy,
  stylePipelineFactorySpy,
  stylePipelinePluginSpy,
} = vi.hoisted(() => ({
  viteNitroPluginSpy: vi.fn(() => []),
  angularSpy: vi.fn(() => []),
  ssrBuildPluginSpy: vi.fn(() => []),
  injectHTMLPluginSpy: vi.fn(() => []),
  depsPluginSpy: vi.fn(() => []),
  routerPluginSpy: vi.fn(() => []),
  routeGenerationPluginSpy: vi.fn(() => ({ name: 'analog-route-generation' })),
  contentPluginSpy: vi.fn(() => []),
  serverModePluginSpy: vi.fn(() => []),
  clearClientPageEndpointsPluginSpy: vi.fn(() => []),
  discoverLibraryRoutesSpy: vi.fn(() => ({
    additionalPagesDirs: [],
    additionalContentDirs: [],
    additionalAPIDirs: [],
  })),
  resolveStylePipelinePluginsSpy: vi.fn(() => []),
  stylePipelineFactorySpy: vi.fn(),
  stylePipelinePluginSpy: { name: 'community-style-pipeline' },
}));

vi.mock('@analogjs/vite-plugin-nitro', () => ({
  nitro: viteNitroPluginSpy,
  default: viteNitroPluginSpy,
}));
vi.mock('@analogjs/vite-plugin-nitro/internal', () => ({
  debugInstances: [],
}));
vi.mock('@analogjs/vite-plugin-angular', () => ({
  angular: angularSpy,
  default: angularSpy,
}));
vi.mock('./ssr/ssr-build-plugin.js', () => ({
  ssrBuildPlugin: ssrBuildPluginSpy,
}));
vi.mock('./ssr/inject-html-plugin.js', () => ({
  injectHTMLPlugin: injectHTMLPluginSpy,
}));
vi.mock('./deps-plugin.js', () => ({
  depsPlugin: depsPluginSpy,
}));
vi.mock('./router-plugin.js', () => ({
  routerPlugin: routerPluginSpy,
}));
vi.mock('./route-generation-plugin.js', () => ({
  routeGenerationPlugin: routeGenerationPluginSpy,
}));
vi.mock('./content-plugin.js', () => ({
  contentPlugin: contentPluginSpy,
}));
vi.mock('../server-mode-plugin.js', () => ({
  serverModePlugin: serverModePluginSpy,
}));
vi.mock('./clear-client-page-endpoint.js', () => ({
  clearClientPageEndpointsPlugin: clearClientPageEndpointsPluginSpy,
}));
vi.mock('./discover-library-routes.js', () => ({
  discoverLibraryRoutes: discoverLibraryRoutesSpy,
}));
vi.mock('./style-pipeline.js', () => ({
  resolveStylePipelinePlugins:
    resolveStylePipelinePluginsSpy.mockImplementation((options) => {
      if (!options) {
        return [];
      }
      return [
        ...(typeof options.plugins?.[0] === 'function'
          ? [stylePipelineFactorySpy]
          : []),
        stylePipelinePluginSpy,
      ];
    }),
}));

import { platformPlugin } from './platform-plugin.js';

describe('platformPlugin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    viteNitroPluginSpy.mockReturnValue([]);
    angularSpy.mockReturnValue([]);
    ssrBuildPluginSpy.mockReturnValue([]);
    injectHTMLPluginSpy.mockReturnValue([]);
    depsPluginSpy.mockReturnValue([]);
    routerPluginSpy.mockReturnValue([]);
    routeGenerationPluginSpy.mockReturnValue({
      name: 'analog-route-generation',
    });
    contentPluginSpy.mockReturnValue([]);
    serverModePluginSpy.mockReturnValue([]);
    clearClientPageEndpointsPluginSpy.mockReturnValue([]);
    resolveStylePipelinePluginsSpy.mockClear();
  });

  it('defaults ssr to true and passes that value to the composed plugins', () => {
    platformPlugin();

    expect(viteNitroPluginSpy).toHaveBeenCalledWith({ ssr: true }, undefined);
    expect(ssrBuildPluginSpy).toHaveBeenCalled();
    expect(injectHTMLPluginSpy).toHaveBeenCalled();
  });

  it('passes through ssr false without wiring SSR-only plugins', () => {
    platformPlugin({ ssr: false });

    expect(viteNitroPluginSpy).toHaveBeenCalledWith({ ssr: false }, undefined);
    expect(ssrBuildPluginSpy).not.toHaveBeenCalled();
    expect(injectHTMLPluginSpy).not.toHaveBeenCalled();
  });

  it('forwards experimental.useAngularCompilationAPI to the Angular vite plugin', () => {
    platformPlugin({
      experimental: {
        useAngularCompilationAPI: true,
      },
    });

    expect(angularSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        experimental: {
          useAngularCompilationAPI: true,
        },
      }),
    );
  });

  it('forwards experimental.enableSelectorless to the Angular vite plugin', () => {
    platformPlugin({
      experimental: {
        enableSelectorless: false,
      },
    });

    expect(angularSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        experimental: expect.objectContaining({
          enableSelectorless: false,
        }),
      }),
    );
  });

  it('does not force semantic type checking onto the dev hot path by default', () => {
    platformPlugin();

    expect(angularSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        disableTypeChecking: undefined,
      }),
    );
  });

  it('does not call the Angular vite plugin when vite is set to false', () => {
    platformPlugin({ vite: false });

    expect(angularSpy).not.toHaveBeenCalled();
  });

  it('still includes non-Angular plugins when vite is set to false', () => {
    const plugins = platformPlugin({ vite: false });

    expect(viteNitroPluginSpy).toHaveBeenCalledWith(
      expect.objectContaining({ ssr: true }),
      undefined,
    );
    expect(routeGenerationPluginSpy).toHaveBeenCalled();
    expect(serverModePluginSpy).toHaveBeenCalled();
    expect(clearClientPageEndpointsPluginSpy).toHaveBeenCalled();
    expect(plugins.length).toBeGreaterThan(0);
  });

  it('does not crash when vite is false and useAngularCompilationAPI is true', () => {
    const plugins = platformPlugin({
      vite: false,
      experimental: {
        useAngularCompilationAPI: true,
      },
    });

    expect(angularSpy).not.toHaveBeenCalled();
    expect(plugins.length).toBeGreaterThan(0);
  });

  it('merges discovered library routes when discoverRoutes is true', () => {
    discoverLibraryRoutesSpy.mockReturnValue({
      additionalPagesDirs: ['/libs/shared/feature'],
      additionalContentDirs: ['/libs/shared/feature/src/content'],
      additionalAPIDirs: ['/libs/shared/feature/src/api'],
    });

    platformPlugin({ discoverRoutes: true });

    expect(discoverLibraryRoutesSpy).toHaveBeenCalled();
    expect(routerPluginSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        additionalPagesDirs: ['/libs/shared/feature'],
      }),
    );
    expect(viteNitroPluginSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        additionalAPIDirs: ['/libs/shared/feature/src/api'],
      }),
      undefined,
    );
    expect(contentPluginSpy).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({
        additionalContentDirs: ['/libs/shared/feature/src/content'],
      }),
    );
  });

  it('deduplicates explicit and discovered dirs', () => {
    discoverLibraryRoutesSpy.mockReturnValue({
      additionalPagesDirs: ['/libs/shared/feature', '/libs/other'],
      additionalContentDirs: [],
      additionalAPIDirs: [],
    });

    platformPlugin({
      discoverRoutes: true,
      additionalPagesDirs: ['/libs/shared/feature'],
    });

    expect(routerPluginSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        additionalPagesDirs: ['/libs/shared/feature', '/libs/other'],
      }),
    );
  });

  it('does not call discoverLibraryRoutes when discoverRoutes is not set', () => {
    platformPlugin();

    expect(discoverLibraryRoutesSpy).not.toHaveBeenCalled();
  });

  it('wires experimental style-pipeline plugins when configured', () => {
    const options = {
      plugins: [stylePipelineFactorySpy],
    };

    platformPlugin({
      experimental: {
        stylePipeline: options,
      },
      workspaceRoot: '/workspace',
    });

    expect(resolveStylePipelinePluginsSpy).toHaveBeenCalledWith(
      options,
      '/workspace',
    );
    expect(stylePipelineFactorySpy).not.toHaveBeenCalled();
  });

  it('forwards angular style-pipeline plugins to the Angular vite plugin', () => {
    const angularStylePipelinePlugin = {
      name: 'community-angular-style-pipeline',
    };

    platformPlugin({
      experimental: {
        stylePipeline: {
          angularPlugins: [angularStylePipelinePlugin],
        },
      },
    });

    expect(angularSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        stylePipeline: {
          plugins: [angularStylePipelinePlugin],
        },
      }),
    );
  });
});
