import {
  jsonLdManifest,
  type JsonLdManifestPluginOptions,
} from '@analogjs/vite-plugin-routes';
import type { Plugin } from 'vite';

import type { Options } from './options.js';

export function jsonLdManifestPlugin(options?: Options): Plugin {
  if (!options?.experimental?.jsonLdManifest) {
    return {
      name: 'analog-json-ld-manifest-disabled',
    };
  }

  const pluginOptions: JsonLdManifestPluginOptions = {
    workspaceRoot: options?.workspaceRoot,
    additionalPagesDirs: options?.additionalPagesDirs,
    additionalContentDirs: options?.additionalContentDirs,
  };

  return jsonLdManifest(pluginOptions);
}
