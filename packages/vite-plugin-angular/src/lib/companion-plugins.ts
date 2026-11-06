import type { Plugin } from 'vite';

import type { AngularBuildContext } from './angular-build-context.js';
import { buildOptimizerPlugin } from './angular-build-optimizer-plugin.js';
import { jitPlugin } from './angular-jit-plugin.js';
import { angularVitestPlugins } from './angular-vitest-plugin.js';
import { componentStylesPlugin } from './component-styles-plugin.js';
import { devServerModePlugin } from './dev-server-mode-plugin.js';
import { encapsulationPlugin } from './encapsulation-plugin.js';
import { liveReloadPlugin } from './live-reload-plugin.js';
import { nxFolderPlugin } from './nx-folder-plugin.js';
import { replaceFiles } from './plugins/file-replacements.plugin.js';
import { routerPlugin } from './router-plugin.js';
import { cssExtensionStyleResolverPlugin } from './utils/css-extension-resolver.js';
import { virtualModulesPlugin } from './virtual-modules-plugin.js';

/**
 * Composes an Angular compiler plugin with Analog's standard companion plugins
 * around a shared `AngularBuildContext`.
 */
export function composeWithCompanions(
  ctx: AngularBuildContext,
  compilerPlugin: Plugin,
): Plugin[] {
  return [
    // Scope the `style` package-export condition to `.css`-extension
    // requests so packages like `@angular/material/prebuilt-themes/*.css`
    // (gated only under `style`) still resolve from JS imports, without
    // leaking `style` into Vite's global `resolve.conditions` and
    // breaking Tailwind v4's JS plugin resolver for packages with mixed
    // exports such as `tailwindcss-primeui`.
    cssExtensionStyleResolverPlugin(),
    replaceFiles(ctx.options.fileReplacements, ctx.options.workspaceRoot),
    virtualModulesPlugin(ctx),
    componentStylesPlugin(ctx),
    compilerPlugin,
    ctx.options.liveReload && liveReloadPlugin(ctx),
    ...(ctx.options.isTest && !ctx.options.isStackBlitz
      ? angularVitestPlugins(ctx)
      : []),
    ctx.options.jit && jitPlugin(ctx),
    buildOptimizerPlugin(ctx),
    !ctx.options.isTest && devServerModePlugin(),
    routerPlugin(ctx),
    nxFolderPlugin(ctx),
    encapsulationPlugin(),
  ].filter(Boolean) as Plugin[];
}
