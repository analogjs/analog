import { CompatibleString } from 'storybook/internal/types';

import { StorybookConfig as StorybookConfigBase } from '@storybook/angular';

import { BuilderOptions, StorybookConfigVite } from '@storybook/builder-vite';

type FrameworkName = CompatibleString<'@analogjs/storybook-angular'>;
type BuilderName = CompatibleString<'@storybook/builder-vite'>;

export type FrameworkOptions = {
  builder?: BuilderOptions;
  /** Compile stories in JIT mode. Defaults to `true`. */
  jit?: boolean;
  /**
   * Enables Analog's Angular live-reload/HMR pipeline for Storybook.
   *
   * This is separate from Vite's `server.hmr` option, which configures the
   * HMR client transport. Defaults to `false`.
   */
  liveReload?: boolean;
  /** Stylesheet extension used for inline component `styles`. Defaults to `css`. */
  inlineStylesExtension?: string;
  /**
   * Path to the tsconfig used for compilation. Defaults to the builder's
   * `tsConfig` option, then `./.storybook/tsconfig.json`.
   */
  tsconfig?: string;
  /** Bootstrap stories without Zone.js. */
  experimentalZoneless?: boolean;
};

type StorybookConfigFramework = {
  framework:
    | FrameworkName
    | {
        name: FrameworkName;
        options: FrameworkOptions;
      };
  core?: StorybookConfigBase['core'] & {
    builder?:
      | BuilderName
      | {
          name: BuilderName;
          options: BuilderOptions;
        };
  };
};

/** The interface for Storybook configuration in `main.ts` files. */
export type StorybookConfig = Omit<
  StorybookConfigBase,
  keyof StorybookConfigVite | keyof StorybookConfigFramework
> &
  StorybookConfigVite &
  StorybookConfigFramework;
