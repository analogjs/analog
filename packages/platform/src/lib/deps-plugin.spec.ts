import { describe, it, expect } from 'vitest';

import { depsPlugin } from './deps-plugin.js';

describe('depsPlugin oxc config', () => {
  it('returns oxc key', () => {
    const plugins = depsPlugin();
    const result = (plugins[0].config as any)();

    expect(result).toHaveProperty('oxc');
    expect(result).not.toHaveProperty('esbuild');
  });

  it('excludes ts/js files so vite-plugin-angular owns Angular file compilation', () => {
    const plugins = depsPlugin();
    const result = (plugins[0].config as any)();

    expect(result.oxc).toEqual({ exclude: ['**/*.ts', '**/*.js'] });
  });
});

describe('depsPlugin ssr config', () => {
  it('pre-bundles and links Angular for the server', () => {
    const plugins = depsPlugin();
    const result = (plugins[0].config as any)();

    expect(result.ssr.optimizeDeps.include).toEqual(
      expect.arrayContaining(['@angular/core', '@angular/platform-server']),
    );
    expect(result.ssr.optimizeDeps.rolldownOptions.plugins).toHaveLength(1);
  });
});
