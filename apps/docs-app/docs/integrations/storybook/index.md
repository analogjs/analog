---
sidebar_position: 5
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Storybook

## Overview

[Storybook](https://storybook.js.org/) is a frontend workshop for building UI components and pages in isolation.

Analog components are just Angular components so integration comes out of the box with [@storybook/angular](https://storybook.js.org/tutorials/intro-to-storybook/angular/en/get-started/).

## Using @storybook/angular's Vite builder

> **Note:**
>
> `@storybook/angular`'s Vite builder is not stable yet. You can follow the progress on [this Github issue](https://github.com/storybookjs/storybook/issues/22544).

For the time being, you can enable this with the following `.storybook/main.ts`. Stay up to date with how best to do this on [this Github issue](https://github.com/brandonroberts/angular-v17-vite-storybook/issues/7).

```ts
const config = {
  stories: ['../src/**/*.mdx', '../src/**/*.stories.@(js|jsx|mjs|ts|tsx)'],
  addons: [
    '@storybook/addon-links',
    '@storybook/addon-essentials',
    '@storybook/addon-interactions',
  ],
  framework: {
    name: '@storybook/angular',
    options: {},
  },
  core: {
    builder: {
      name: '@storybook/builder-vite',
      options: {
        viteConfigPath: undefined,
      },
    },
  },
  async viteFinal(config) {
    // Merge custom configuration into the default config
    const { mergeConfig } = await import('vite');
    const { default: angular } = await import('@analogjs/vite-plugin-angular');

    /**
     * Replace imports of "@storybook/angular" with "@storybook/angular/dist/client"
     */
    const storybookAngularImportPlugin = () => ({
      name: '@storybook/angular',
      config() {
        return {
          build: {
            minify: false,
            rollupOptions: {
              plugins: [
                {
                  name: 'disable-compiler-treeshake',
                  transform(_code: string, id: string) {
                    if (id.includes('compiler')) {
                      console.log('compiler.mjs', id);
                      return { moduleSideEffects: 'no-treeshake' };
                    }

                    return;
                  },
                },
              ],
            },
          },
        };
      },
      transform(code: string) {
        if (code.includes('"@storybook/angular"')) {
          return code.replace(
            /\"@storybook\/angular\"/g,
            '"@storybook/angular/dist/client"'
          );
        }

        return;
      },
    });

    return mergeConfig(config, {
      // Add dependencies to pre-optimization
      plugins: [
        angular({ jit: true, tsconfig: './.storybook/tsconfig.json' }),
        storybookAngularImportPlugin(),
      ],
    });
  },
  docs: {
    autodocs: 'tag',
  },
};

export default config;
```
