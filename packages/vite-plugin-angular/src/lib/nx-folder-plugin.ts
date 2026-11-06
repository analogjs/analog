import { normalizePath, type Plugin } from 'vite';
import {
  isAngularBuildContext,
  type AngularBuildContext,
} from './angular-build-context.js';

function isNxCacheFile(file: string): boolean {
  return file.includes(normalizePath('/.nx/'));
}

/**
 * Ignores anything in the `.nx` folder from triggering HMR.
 * When given an `AngularBuildContext`, also registers the ignore predicate
 * into `ctx.hmr` so compiler `handleHotUpdate` hooks skip `.nx` writes.
 */
export function nxFolderPlugin(ctx?: AngularBuildContext): Plugin {
  if (isAngularBuildContext(ctx)) {
    ctx.hmr.addIgnoreFilter(isNxCacheFile);
  }

  return {
    name: 'analogjs-nx-folder-plugin',
    apply: 'serve',
    handleHotUpdate(hmrCtx) {
      if (isNxCacheFile(hmrCtx.file)) {
        return [];
      }

      return hmrCtx.modules;
    },
  };
}
