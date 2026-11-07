import { describe, expect, it } from 'vitest';

import { angular, type PluginOptions } from './ngtsc-compile-plugin';
import { findAngularCompiler } from './angular-compiler-api';
import { angularCompilationPlugin } from './compilation-api/index';

describe('findAngularCompiler', () => {
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

  it('returns undefined without an Angular compiler', () => {
    expect(findAngularCompiler([{ name: 'other' }])).toBeUndefined();
  });
});
