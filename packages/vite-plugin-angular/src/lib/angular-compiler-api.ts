import type { Plugin } from 'vite';
import type { ComponentUpdates } from './live-reload-plugin.js';

/**
 * The `api` every Analog Angular compiler plugin exposes, so companion
 * plugins read compiler state through one contract whichever compilation
 * path is active.
 */
export interface AngularCompilerApi {
  /** Resolves the tsconfig the compiler reads. Available after `config`. */
  getTsConfigPath(): string;
  /** Component HMR updates, when the compiler serves `/@ng/component`. */
  componentUpdates?: ComponentUpdates;
  /** Source map emitted for a compiled file, chained by Vitest. */
  getSourceMap?(id: string): string | undefined;
}

export type AngularCompilerPlugin = Plugin<AngularCompilerApi> & {
  api: AngularCompilerApi;
};

const compilerPluginNames = new Set([
  '@analogjs/vite-plugin-angular',
  '@analogjs/vite-plugin-angular-fast-compile',
  '@analogjs/vite-plugin-angular-ngp',
  '@analogjs/vite-plugin-angular-compilation-api',
]);

/** Finds the active Angular compiler plugin in a Vite plugin list. */
export function findAngularCompiler(
  plugins: readonly Plugin[],
): AngularCompilerPlugin | undefined {
  return plugins.find((plugin): plugin is AngularCompilerPlugin =>
    compilerPluginNames.has(plugin.name),
  );
}
