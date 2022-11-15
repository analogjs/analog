import type { PluginOptions } from '@analogjs/vite-plugin-angular';
import { NitroConfig } from 'nitropack';

export interface Options {
  vite?: PluginOptions;
  nitro?: NitroConfig;
}
