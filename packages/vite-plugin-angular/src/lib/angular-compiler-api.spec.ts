import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { angular, type PluginOptions } from './angular-vite-plugin';
import { findAngularCompiler } from './angular-compiler-api';
import { angularCompilationPlugin } from './compilation-api/index';

describe('findAngularCompiler', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('VITEST', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each<{ options: PluginOptions; name: string; serves: boolean }>([
    { options: {}, name: '@analogjs/vite-plugin-angular', serves: true },
    {
      options: { fastCompile: true },
      name: '@analogjs/vite-plugin-angular-fast-compile',
      serves: false,
    },
    {
      options: { compilation: 'ngp' },
      name: '@analogjs/vite-plugin-angular-ngp',
      serves: true,
    },
  ])('finds $name among angular() plugins', ({ options, name, serves }) => {
    const compiler = findAngularCompiler(angular({ ...options, jit: false }));

    expect(compiler?.name).toBe(name);
    expect(compiler?.api.getTsConfigPath).toBeTypeOf('function');
    expect(!!compiler?.api.componentUpdates).toBe(serves);
  });

  it('finds the Compilation API compiler', () => {
    const compiler = findAngularCompiler(angularCompilationPlugin());

    expect(compiler?.name).toBe(
      '@analogjs/vite-plugin-angular-compilation-api',
    );
    expect(compiler?.api.componentUpdates).toBeDefined();
  });

  it('omits ngtsc component updates under Vitest', () => {
    vi.stubEnv('VITEST', 'true');
    const plugins = angular({ jit: false });

    expect(findAngularCompiler(plugins)?.api.componentUpdates).toBeUndefined();
    expect(plugins.map(({ name }) => name)).not.toContain(
      '@analogjs/vite-plugin-angular:live-reload',
    );
  });

  it('returns undefined without an Angular compiler', () => {
    expect(findAngularCompiler([{ name: 'other' }])).toBeUndefined();
  });
});
