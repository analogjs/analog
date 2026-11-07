import type { Plugin } from 'vite';

import type { AngularCompilerPlugin } from './angular-compiler-api.js';
import { buildOptimizerPlugin } from './angular-build-optimizer-plugin.js';
import { jitPlugin } from './angular-jit-plugin.js';
import { angularVitestPlugins } from './angular-vitest-plugin.js';
import { encapsulationPlugin } from './encapsulation-plugin.js';
import { liveReloadPlugin } from './live-reload-plugin.js';
import { nxFolderPlugin } from './nx-folder-plugin.js';
import {
  replaceFiles,
  type FileReplacement,
} from './plugins/file-replacements.plugin.js';
import { routerPlugin } from './router-plugin.js';
import { cssExtensionStyleResolverPlugin } from './utils/css-extension-resolver.js';
import { isServerEnvironment } from './utils/plugin-config.js';
import { virtualModulesPlugin } from './virtual-modules-plugin.js';

export interface SupportPluginOptions {
  jit: boolean;
  isTest: boolean;
  liveReload: boolean;
  inlineStylesExtension: string;
  fileReplacements: FileReplacement[];
  workspaceRoot: string;
}

/**
 * Surrounds an Angular compiler plugin with the plugins every compilation
 * path needs, reading compiler state through its `api`.
 */
export function angularSupportPlugins(
  compiler: AngularCompilerPlugin,
  options: SupportPluginOptions,
): Plugin[] {
  const { componentUpdates, getSourceMap } = compiler.api;
  const isStackBlitz = !!process.versions['webcontainer'];

  return [
    // Scope the `style` package-export condition to `.css`-extension
    // requests so packages like `@angular/material/prebuilt-themes/*.css`
    // (gated only under `style`) still resolve from JS imports, without
    // leaking `style` into Vite's global `resolve.conditions` and
    // breaking Tailwind v4's JS plugin resolver for packages with mixed
    // exports such as `tailwindcss-primeui`.
    cssExtensionStyleResolverPlugin(),
    replaceFiles(options.fileReplacements, options.workspaceRoot),
    virtualModulesPlugin({ jit: options.jit }),
    options.liveReload &&
      componentUpdates &&
      liveReloadPlugin(componentUpdates),
    compiler,
    ...(options.isTest && !isStackBlitz
      ? angularVitestPlugins(getSourceMap)
      : []),
    options.jit &&
      jitPlugin({ inlineStylesExtension: options.inlineStylesExtension }),
    buildOptimizerPlugin({ jit: options.jit }),
    !options.isTest && devServerModePlugin(),
    routerPlugin(),
    nxFolderPlugin(),
    encapsulationPlugin(),
  ].filter((plugin): plugin is Plugin => !!plugin);
}

function devServerModePlugin(): Plugin {
  return {
    name: '@analogjs/vite-plugin-angular:dev-server-mode',
    apply: 'serve',
    // After other plugins' hooks, so a consumer they set is taken into account.
    configEnvironment: {
      order: 'post',
      handler(name, config) {
        if (isServerEnvironment(name, config)) {
          return { define: { ngServerMode: 'true' } };
        }
        return undefined;
      },
    },
  };
}
