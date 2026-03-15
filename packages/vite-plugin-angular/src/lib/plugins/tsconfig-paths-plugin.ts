import { dirname, isAbsolute, resolve } from 'node:path';
import { normalizePath } from 'vite';
import type { Plugin } from 'vite';

export interface TsconfigPathsOptions {
  /** Root directory for tsconfig.json lookup. Relative to Vite's root. */
  root?: string;
}

export function tsconfigPathsPlugin(opts?: TsconfigPathsOptions): Plugin {
  let resolverSync: (directory: string, request: string) => { path?: string };

  return {
    name: 'analogjs-tsconfig-paths',
    async configResolved(config) {
      // oxc-resolver is ESM-only; dynamic import for broad compatibility
      const { ResolverFactory } = await import('oxc-resolver');

      const root = opts?.root ? resolve(config.root, opts.root) : config.root;

      const resolver = new ResolverFactory({
        tsconfig: {
          configFile: resolve(root, 'tsconfig.json'),
          references: 'auto',
        },
        conditionNames: ['node', 'import'],
        extensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.json'],
        mainFields: ['module', 'main'],
        symlinks: true,
      });

      resolverSync = (directory, request) => resolver.sync(directory, request);
    },
    resolveId(source, importer) {
      if (
        !importer ||
        !resolverSync ||
        source.startsWith('\0') ||
        source.startsWith('.') ||
        source.startsWith('/') ||
        isAbsolute(source)
      ) {
        return null;
      }

      const result = resolverSync(dirname(importer), source);
      if (result.path) {
        return normalizePath(result.path);
      }

      return null;
    },
  };
}
