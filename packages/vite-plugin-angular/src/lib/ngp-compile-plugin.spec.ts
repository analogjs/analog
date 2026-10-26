import { describe, expect, it } from 'vitest';
import { angular, type PluginOptions } from './angular-vite-plugin';

describe('compilation selection', () => {
  it.each<{ options: PluginOptions; name: string }>([
    { options: {}, name: '@analogjs/vite-plugin-angular' },
    { options: { fastCompile: false }, name: '@analogjs/vite-plugin-angular' },
    {
      options: { fastCompile: true },
      name: '@analogjs/vite-plugin-angular-fast-compile',
    },
    {
      options: { compilation: 'ngtsc', fastCompile: true },
      name: '@analogjs/vite-plugin-angular',
    },
    {
      options: { compilation: 'ngp', fastCompile: false },
      name: '@analogjs/vite-plugin-angular-ngp',
    },
    {
      options: { compilation: 'ngp', fastCompile: true },
      name: '@analogjs/vite-plugin-angular-ngp',
    },
  ])('selects $name for $options', ({ options, name }) => {
    const plugins = angular({ ...options, jit: false, liveReload: true });
    expect(
      plugins
        .map((plugin) => plugin.name)
        .filter((pluginName) =>
          [
            '@analogjs/vite-plugin-angular',
            '@analogjs/vite-plugin-angular-fast-compile',
            '@analogjs/vite-plugin-angular-ngp',
          ].includes(pluginName),
        ),
    ).toEqual([name]);
  });

  it('uses ngtsc under Vitest when jit is not set', () => {
    const names = angular({ compilation: 'ngp', liveReload: true }).map(
      (plugin) => plugin.name,
    );
    expect(names).toContain('@analogjs/vite-plugin-angular');
    expect(names).not.toContain('@analogjs/vite-plugin-angular-ngp');
  });

  it('preserves companion plugins without loading NGP', () => {
    const options = { jit: false, liveReload: true };
    const fastCompile = angular({ ...options, fastCompile: true }).map(
      (plugin) => plugin.name,
    );
    const ngp = angular({ ...options, compilation: 'ngp' }).map(
      (plugin) => plugin.name,
    );
    expect(ngp).toEqual(
      fastCompile.map((name) =>
        name === '@analogjs/vite-plugin-angular-fast-compile'
          ? '@analogjs/vite-plugin-angular-ngp'
          : name,
      ),
    );
  });

  it.each([{ jit: true }, { jit: false, fastCompileMode: 'partial' as const }])(
    'rejects unsupported NGP compilation options: %j',
    (options) => {
      expect(() => angular({ compilation: 'ngp', ...options })).toThrow(
        "requires jit: false and fastCompileMode: 'full'",
      );
    },
  );
});
