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
} = vi.hoisted(() => ({
  analogNitroPluginSpy: vi.fn(() => ({ name: '@analogjs/nitro' })),
  ssrBuildPluginSpy: vi.fn(() => []),
  injectHTMLPluginSpy: vi.fn(() => []),
  depsPluginSpy: vi.fn(() => []),
  routerPluginSpy: vi.fn(() => []),
  routeGenerationPluginSpy: vi.fn(() => ({ name: 'analog-route-generation' })),
  contentPluginSpy: vi.fn(() => []),
  serverModePluginSpy: vi.fn(() => []),
  clearClientPageEndpointsPluginSpy: vi.fn(() => ({
    name: 'analogjs-platform-clear-client-page-endpoint',
  })),
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
    clearClientPageEndpointsPluginSpy.mockReturnValue({
      name: 'analogjs-platform-clear-client-page-endpoint',
    });
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

  it('passes through explicit additional route dirs when discoverRoutes is true', () => {
    platformPlugin({
      discoverRoutes: true,
      additionalPagesDirs: ['/libs/shared/feature'],
      additionalContentDirs: ['/libs/shared/feature/src/content'],
      additionalAPIDirs: ['/libs/shared/feature/src/api'],
    });

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

  function getIntegrationPlugin(
    options?: Parameters<typeof platformPlugin>[0],
  ) {
    return platformPlugin(options).find(
      (p: any) => p.name === 'analogjs-platform-angular-integration',
    ) as any;
  }

  it('keeps Angular away from content modules through analog.setup', () => {
    const registerTransformFilter = vi.fn();

    getIntegrationPlugin().analog.setup({
      registerTransformFilter,
      addInclude: vi.fn(),
    });

    const filter = registerTransformFilter.mock.calls[0][0];
    expect(filter('', '/src/content/post.md?analog-content-file=true')).toBe(
      false,
    );
    expect(filter('', '/src/app/app.component.ts')).toBe(true);
  });

  it('registers library page globs with Angular through analog.setup', () => {
    const addInclude = vi.fn();

    getIntegrationPlugin({
      additionalPagesDirs: ['/libs/shared/feature', '/libs/other'],
    }).analog.setup({ registerTransformFilter: vi.fn(), addInclude });

    expect(addInclude).toHaveBeenCalledWith([
      '/libs/shared/feature/**/*.page.ts',
      '/libs/other/**/*.page.ts',
    ]);
  });

  it('adds no includes without additionalPagesDirs', () => {
    const addInclude = vi.fn();

    getIntegrationPlugin().analog.setup({
      registerTransformFilter: vi.fn(),
      addInclude,
    });

    expect(addInclude).not.toHaveBeenCalled();
  });
});
