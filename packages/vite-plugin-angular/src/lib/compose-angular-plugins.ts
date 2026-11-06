import type { Plugin } from 'vite';

import {
  ensureAngularBuildContext,
  type AngularBuildContext,
  type AngularBuildContextOptions,
} from './angular-build-context.js';
import { compilationApiPlugin } from './compilation-api/compilation-api-plugin.js';
import { composeWithCompanions } from './companion-plugins.js';
import { fastCompilePlugin } from './fast-compile-plugin.js';
import { ngpCompilePlugin } from './ngp-compile-plugin.js';
import { ngtscCompilePlugin } from './ngtsc-compile-plugin.js';

/**
 * Instantiates the compiler plugin matching `ctx.options.compilation` and
 * registers its `AngularCompilerCapabilities` onto `ctx`.
 */
export function selectAngularCompilerPlugin(ctx: AngularBuildContext): Plugin {
  switch (ctx.options.compilation) {
    case 'fast':
      return fastCompilePlugin(ctx);
    case 'ngp':
      return ngpCompilePlugin(ctx);
    case 'compilation-api':
      return compilationApiPlugin(ctx);
    case 'ngtsc':
    default:
      return ngtscCompilePlugin(ctx);
  }
}

/**
 * Composes the selected Angular compiler plugin and Analog's companion plugins
 * around an `AngularBuildContext` (or options object).
 */
export function composeAngularPlugins(
  ctxOrOptions?: AngularBuildContext | AngularBuildContextOptions,
): Plugin[] {
  const ctx = ensureAngularBuildContext(ctxOrOptions);
  return composeWithCompanions(ctx, selectAngularCompilerPlugin(ctx));
}
