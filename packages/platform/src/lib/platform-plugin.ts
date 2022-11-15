import { Plugin } from 'vite';
import angular from '@analogjs/vite-plugin-angular';

import { Options } from './options';
import { viteNitroPlugin } from './vite-nitro-plugin';

export function platformPlugin(opts?: Options): Plugin[] {
  return [viteNitroPlugin(opts?.nitro), ...angular(opts?.vite)];
}
