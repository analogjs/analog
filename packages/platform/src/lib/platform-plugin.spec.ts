import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  analogNitroPluginSpy,
  ssrBuildPluginSpy,
  injectHTMLPluginSpy,
  depsPluginSpy,
  routerPluginSpy,
  typedRoutesSpy,
  contentPluginSpy,
  serverModePluginSpy,
  clearClientPageEndpointsPluginSpy,
} = vi.hoisted(() => ({
  analogNitroPluginSpy: vi.fn(() => ({ name: '@analogjs/nitro' })),
  ssrBuildPluginSpy: vi.fn(() => []),
  injectHTMLPluginSpy: vi.fn(() => []),
  depsPluginSpy: vi.fn(() => []),
  routerPluginSpy: vi.fn(() => []),
  typedRoutesSpy: vi.fn(() => ({ name: 'analog-typed-routes' })),
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
vi.mock('./typed-routes-plugin.js', () => ({
  typedRoutes: typedRoutesSpy,
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
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('VITEST', undefined);
    analogNitroPluginSpy.mockReturnValue({ name: '@analogjs/nitro' });
    ssrBuildPluginSpy.mockReturnValue([]);
    injectHTMLPluginSpy.mockReturnValue([]);
    depsPluginSpy.mockReturnValue([]);
    routerPluginSpy.mockReturnValue([]);
    typedRoutesSpy.mockReturnValue({
      name: 'analog-typed-routes',
    });
    contentPluginSpy.mockReturnValue([]);
    serverModePluginSpy.mockReturnValue([]);
    clearClientPageEndpointsPluginSpy.mockReturnValue({
      name: 'analogjs-platform-clear-client-page-endpoint',
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each([
    { NODE_ENV: 'test', VITEST: undefined },
    { NODE_ENV: 'development', VITEST: 'true' },
  ])('does not register Nitro when testing with %j', ({ NODE_ENV, VITEST }) => {
    vi.stubEnv('NODE_ENV', NODE_ENV);
    vi.stubEnv('VITEST', VITEST);

    const plugins = platformPlugin();

    expect(analogNitroPluginSpy).not.toHaveBeenCalled();
    expect(plugins.some((plugin) => plugin.name === '@analogjs/nitro')).toBe(
      false,
    );
  });

  it('wires SSR-only plugins by default', () => {
    platformPlugin();

    expect(ssrBuildPluginSpy).toHaveBeenCalled();
    expect(injectHTMLPluginSpy).toHaveBeenCalled();
  });

  it('skips SSR-only plugins when ssr is false', () => {
    platformPlugin({ ssr: false });

    expect(ssrBuildPluginSpy).not.toHaveBeenCalled();
    expect(injectHTMLPluginSpy).not.toHaveBeenCalled();
  });

  it('registers the streaming plugin when experimental.streaming is on', () => {
    const hasStreaming = (plugins: { name: string }[]) =>
      plugins.some((plugin) => plugin.name === 'analogjs-defer-streaming');

    expect(hasStreaming(platformPlugin())).toBe(false);
    expect(
      hasStreaming(platformPlugin({ experimental: { streaming: true } })),
    ).toBe(true);
  });

  it.each([undefined, false])(
    'keeps typed routing opt-in (%s)',
    (typedRouting) => {
      const plugins = platformPlugin({ experimental: { typedRouting } });
      expect(typedRoutesSpy).not.toHaveBeenCalled();
      expect(
        plugins.some((plugin) => plugin.name === 'analog-typed-routes'),
      ).toBe(false);
    },
  );

  it('registers typed routing before other plugins', () => {
    const plugins = platformPlugin({
      experimental: { typedRouting: { outFile: 'src/routes.d.ts' } },
    });
    expect(plugins[0].name).toBe('analog-typed-routes');
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
