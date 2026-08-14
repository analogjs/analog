import { beforeEach, describe, expect, it, vi } from 'vitest';

import { typedRoutes } from './typed-routes-plugin.js';
import { routeGenerationPlugin } from './route-generation-plugin.js';

vi.mock('./typed-routes-plugin.js', () => ({
  typedRoutes: vi.fn(() => ({ name: 'analog-typed-routes' })),
}));

describe('routeGenerationPlugin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns no-op when no options provided', () => {
    const plugin = routeGenerationPlugin();
    expect(plugin.name).toBe('analog-route-generation-disabled');
    expect(typedRoutes).not.toHaveBeenCalled();
  });

  it('returns the typed routes plugin when enabled with boolean true', () => {
    const plugin = routeGenerationPlugin({
      experimental: {
        typedRouter: true,
      },
    });

    expect(plugin.name).toBe('analog-typed-routes');
    expect(typedRoutes).toHaveBeenCalledWith({
      jsonLdManifest: true,
      workspaceRoot: undefined,
      additionalPagesDirs: undefined,
      additionalContentDirs: undefined,
    });
  });

  it('returns the typed routes plugin when enabled with options', () => {
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

    expect(plugin.name).toBe('analog-typed-routes');
    expect(typedRoutes).toHaveBeenCalledWith({
      outFile: 'src/generated/routeTree.gen.ts',
      jsonLdManifest: true,
      workspaceRoot: '/workspace',
      additionalPagesDirs: ['/libs/pages'],
      additionalContentDirs: ['/libs/content'],
    });
  });

  it('allows disabling only the JSON-LD manifest output', () => {
    routeGenerationPlugin({
      experimental: {
        typedRouter: {
          jsonLdManifest: false,
        },
      },
    });

    expect(typedRoutes).toHaveBeenCalledWith({
      jsonLdManifest: false,
      workspaceRoot: undefined,
      additionalPagesDirs: undefined,
      additionalContentDirs: undefined,
    });
  });

  it('returns no-op when experimental is undefined', () => {
    const plugin = routeGenerationPlugin({ experimental: undefined });
    expect(plugin.name).toBe('analog-route-generation-disabled');
    expect(typedRoutes).not.toHaveBeenCalled();
  });

  it('returns no-op when typedRouter is false', () => {
    const plugin = routeGenerationPlugin({
      experimental: { typedRouter: false },
    });
    expect(plugin.name).toBe('analog-route-generation-disabled');
    expect(typedRoutes).not.toHaveBeenCalled();
  });
});
