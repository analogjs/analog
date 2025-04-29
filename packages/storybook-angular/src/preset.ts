import { dirname, join } from 'node:path';

import { Options, PresetProperty } from 'storybook/internal/types';
import { core as PresetCore } from '@storybook/angular/dist/preset.js';

import { StandaloneOptions } from './lib/utils/standalone-options';
import { StorybookConfig } from './types';

const getAbsolutePath = <I extends string>(input: I): I =>
  dirname(require.resolve(join(input, 'package.json'))) as any;

export const core: PresetProperty<'core'> = async (config, options) => {
  const presetCore = (PresetCore as any)(config, options);

  return {
    ...presetCore,
    builder: {
      name: getAbsolutePath('@storybook/builder-vite'),
      options: { ...presetCore.options },
    },
  };
};

export const viteFinal: NonNullable<StorybookConfig['viteFinal']> = async (
  config,
  options: Options & StandaloneOptions,
) => {
  // Merge custom configuration into the default config
  const { mergeConfig } = await import('vite');
  const { default: angular } = await import('@analogjs/vite-plugin-angular');

  // @ts-ignore
  const framework = await options.presets.apply<any>('framework');

  return mergeConfig(config, {
    // Add dependencies to pre-optimization
    optimizeDeps: {
      include: [
        '@storybook/angular/dist/client/index.js',
        '@analogjs/storybook-angular',
        '@angular/compiler',
        '@angular/platform-browser/animations',
        '@storybook/addon-docs/angular',
        'react/jsx-dev-runtime',
        'tslib',
        'zone.js',
      ],
    },
    plugins: [
      angular({
        jit:
          typeof framework.options?.jit !== 'undefined'
            ? framework.options?.jit
            : true,
        liveReload:
          typeof framework.options?.liveReload !== 'undefined'
            ? framework.options?.liveReload
            : false,
        tsconfig: options?.tsConfig ?? './.storybook/tsconfig.json',
      }),
    ],
    define: {
      STORYBOOK_ANGULAR_OPTIONS: JSON.stringify({
        experimentalZoneless:
          !!options?.angularBuilderOptions?.experimentalZoneless,
      }),
    },
  });
};

export { addons, previewAnnotations } from '@storybook/angular/dist/preset.js';
