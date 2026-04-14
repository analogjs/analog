import { CompatibleString } from 'storybook/internal/types';

import { StorybookConfig as StorybookConfigBase } from '@storybook/angular';

import { BuilderOptions, StorybookConfigVite } from '@storybook/builder-vite';

type FrameworkName = CompatibleString<'@analogjs/storybook-angular'>;
type BuilderName = CompatibleString<'@storybook/builder-vite'>;

export type FrameworkOptions = {
  builder?: BuilderOptions;
  jit?: boolean;
  /**
   * Enables Analog's Angular live-reload/HMR pipeline for Storybook.
   *
   * This is separate from Vite's `server.hmr` option, which configures the
   * HMR client transport.
   */
  liveReload?: boolean;
  /**
   * Compatibility alias for `liveReload`.
   */
  hmr?: boolean;
  inlineStylesExtension?: string;
  tsconfig?: string;
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
