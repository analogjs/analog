import { beforeEach, describe, expect, it, vi } from 'vitest';

import { routeGenerationPlugin } from './route-generation-plugin.js';

vi.mock('@analogjs/vite-plugin-routes', () => ({
  typedRoutes: vi.fn(() => ({ name: 'analog-typed-routes' })),
}));

describe('routeGenerationPlugin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a no-op plugin when typed routes are disabled', async () => {
    const plugin = routeGenerationPlugin();
    const vitePluginRoutesImport = await import('@analogjs/vite-plugin-routes');

    expect(plugin.name).toBe('analog-route-generation-disabled');
    expect(vitePluginRoutesImport.typedRoutes).not.toHaveBeenCalled();
  });

  it('delegates typed route generation to the public routes plugin', async () => {
    const plugin = routeGenerationPlugin({
      workspaceRoot: '/workspace',
      additionalPagesDirs: ['/libs/pages'],
      additionalContentDirs: ['/libs/content'],
      experimental: {
        typedRouter: {
          outFile: 'src/generated/routeTree.gen.ts',
          jsonLdManifest: true,
        },
      },
    });
    const vitePluginRoutesImport = await import('@analogjs/vite-plugin-routes');

    expect(vitePluginRoutesImport.typedRoutes).toHaveBeenCalledWith({
      outFile: 'src/generated/routeTree.gen.ts',
      jsonLdManifest: true,
      workspaceRoot: '/workspace',
      additionalPagesDirs: ['/libs/pages'],
      additionalContentDirs: ['/libs/content'],
    });
    expect(plugin.name).toBe('analog-typed-routes');
  });

  it('enables the JSON-LD manifest by default when typedRouter is true', async () => {
    routeGenerationPlugin({
      workspaceRoot: '/workspace',
      experimental: {
        typedRouter: true,
      },
    });
    const vitePluginRoutesImport = await import('@analogjs/vite-plugin-routes');

    expect(vitePluginRoutesImport.typedRoutes).toHaveBeenCalledWith({
      jsonLdManifest: true,
      workspaceRoot: '/workspace',
      additionalPagesDirs: undefined,
      additionalContentDirs: undefined,
    });
  });

  it('allows disabling only the JSON-LD manifest output', async () => {
    routeGenerationPlugin({
      experimental: {
        typedRouter: {
          jsonLdManifest: false,
        },
      },
    });
    const vitePluginRoutesImport = await import('@analogjs/vite-plugin-routes');

    expect(vitePluginRoutesImport.typedRoutes).toHaveBeenCalledWith({
      jsonLdManifest: false,
      workspaceRoot: undefined,
      additionalPagesDirs: undefined,
      additionalContentDirs: undefined,
    });
  });
});
