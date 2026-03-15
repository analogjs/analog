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
          outFile: 'src/generated/routes.gen.ts',
        },
      },
    });
    const vitePluginRoutesImport = await import('@analogjs/vite-plugin-routes');

    expect(vitePluginRoutesImport.typedRoutes).toHaveBeenCalledWith({
      outFile: 'src/generated/routes.gen.ts',
      workspaceRoot: '/workspace',
      additionalPagesDirs: ['/libs/pages'],
      additionalContentDirs: ['/libs/content'],
    });
    expect(plugin.name).toBe('analog-typed-routes');
  });
});
