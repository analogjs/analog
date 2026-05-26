import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  analogNitroPluginSpy,
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
  analogNitroPluginSpy: vi.fn(() => ({ name: '@analogjs/nitro' })),
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

vi.mock('./nitro/analog-nitro-plugin.js', () => ({
  analogNitroPlugin: analogNitroPluginSpy,
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
    analogNitroPluginSpy.mockReturnValue({ name: '@analogjs/nitro' });
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

    expect(analogNitroPluginSpy).toHaveBeenCalledWith(
      expect.objectContaining({ ssr: true }),
    );
    expect(ssrBuildPluginSpy).toHaveBeenCalled();
    expect(injectHTMLPluginSpy).toHaveBeenCalled();
  });

  it('passes through ssr false without wiring SSR-only plugins', () => {
    platformPlugin({ ssr: false });

    expect(analogNitroPluginSpy).toHaveBeenCalledWith(
      expect.objectContaining({ ssr: false }),
    );
    expect(ssrBuildPluginSpy).not.toHaveBeenCalled();
    expect(injectHTMLPluginSpy).not.toHaveBeenCalled();
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
    expect(analogNitroPluginSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        additionalAPIDirs: ['/libs/shared/feature/src/api'],
      }),
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
});
