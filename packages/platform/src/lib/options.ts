import type { PluginOptions } from '@analogjs/vite-plugin-angular';
import { NitroConfig } from 'nitropack';

export interface Options {
  ssr?: boolean;
  ssrBuildDir?: string;
  prerender?: boolean;
  entryServer?: string;
  vite?: PluginOptions;
  nitro?: NitroConfig;
}
