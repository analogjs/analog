import { describe, it, expect, vi, beforeEach } from 'vitest';

let mockRolldownVersion: string | undefined;

vi.mock('vite', async () => {
  const actual = await vi.importActual<typeof import('vite')>('vite');
  return {
    ...actual,
    get rolldownVersion() {
      return mockRolldownVersion;
    },
  };
});

import { depsPlugin } from './deps-plugin.js';

describe('depsPlugin OXC conditional config', () => {
  beforeEach(() => {
    mockRolldownVersion = undefined;
  });

  it('returns oxc key when rolldownVersion is set', () => {
    mockRolldownVersion = '1.0.0';
    const plugins = depsPlugin();
    const result = (plugins[0].config as any)();

    expect(result).toHaveProperty('oxc');
    expect(result).not.toHaveProperty('esbuild');
  });

  it('returns esbuild key when rolldownVersion is not set', () => {
    mockRolldownVersion = undefined;
    const plugins = depsPlugin();
    const result = (plugins[0].config as any)();

    expect(result).toHaveProperty('esbuild');
    expect(result).not.toHaveProperty('oxc');
  });

  it('excludes ts/js files by default with oxc', () => {
    mockRolldownVersion = '1.0.0';
    const plugins = depsPlugin();
    const result = (plugins[0].config as any)();

    expect(result.oxc).toEqual({ exclude: ['**/*.ts', '**/*.js'] });
  });

  it('excludes ts/js files by default with esbuild', () => {
    mockRolldownVersion = undefined;
    const plugins = depsPlugin();
    const result = (plugins[0].config as any)();

    expect(result.esbuild).toEqual({ exclude: ['**/*.ts', '**/*.js'] });
  });

  it('uses empty oxc config when vite option is false', () => {
    mockRolldownVersion = '1.0.0';
    const plugins = depsPlugin({ vite: false } as any);
    const result = (plugins[0].config as any)();

    expect(result.oxc).toEqual({});
  });

  it('uses empty esbuild config when vite option is false', () => {
    mockRolldownVersion = undefined;
    const plugins = depsPlugin({ vite: false } as any);
    const result = (plugins[0].config as any)();

    expect(result.esbuild).toEqual({});
  });

  it('uses empty config when useAngularCompilationAPI is enabled', () => {
    mockRolldownVersion = undefined;
    const plugins = depsPlugin({
      vite: { experimental: { useAngularCompilationAPI: true } },
    } as any);
    const result = (plugins[0].config as any)();

    expect(result.esbuild).toEqual({});
  });
});
