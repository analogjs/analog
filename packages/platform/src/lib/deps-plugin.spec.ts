import { resolveConfig } from 'vite';
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

  it("keeps the user's own transform config", async () => {
    const userConfig = {
      configFile: false as const,
      plugins: depsPlugin(),
      oxc: { include: ['src/server/**/*.ts'] },
    };
    const { oxc } = await resolveConfig(userConfig, 'serve');

    expect(oxc).toMatchObject({ include: ['src/server/**/*.ts'] });
    expect((oxc as { exclude?: unknown }).exclude).toBeUndefined();
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
