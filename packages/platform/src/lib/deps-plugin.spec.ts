import { describe, it, expect } from 'vitest';

import { depsPlugin } from './deps-plugin.js';

describe('depsPlugin oxc config', () => {
  it('returns oxc key', () => {
    const plugins = depsPlugin();
    const result = (plugins[0].config as any)();

    expect(result).toHaveProperty('oxc');
    expect(result).not.toHaveProperty('esbuild');
  });

  it('excludes ts/js files by default', () => {
    const plugins = depsPlugin();
    const result = (plugins[0].config as any)();

    expect(result.oxc).toEqual({ exclude: ['**/*.ts', '**/*.js'] });
  });

  it('uses empty oxc config when vite option is false', () => {
    const plugins = depsPlugin({ vite: false } as any);
    const result = (plugins[0].config as any)();

    expect(result.oxc).toEqual({});
  });

  it('uses empty config when useAngularCompilationAPI is enabled', () => {
    const plugins = depsPlugin({
      vite: { experimental: { useAngularCompilationAPI: true } },
    } as any);
    const result = (plugins[0].config as any)();

    expect(result.oxc).toEqual({});
  });
});
