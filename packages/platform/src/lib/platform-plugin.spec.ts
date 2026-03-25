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
}));

vi.mock('@analogjs/vite-plugin-nitro', () => ({
  default: viteNitroPluginSpy,
}));
vi.mock('@analogjs/vite-plugin-angular', () => ({ default: angularSpy }));
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
});
