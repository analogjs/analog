export interface ViteBuildExecutorOptions {
  outputPath?: string;
  buildLibsFromSource?: boolean;
  skipTypeCheck?: boolean;
  base?: string;
  configFile?: string;
  emptyOutDir?: boolean;
  sourcemap?: boolean | 'inline' | 'hidden';
  target?: string;
  minify?: boolean | 'terser' | 'esbuild';
  manifest?: boolean | string;
  ssrManifest?: boolean | string;
  ssr?: boolean | string;
  logLevel?: 'info' | 'warn' | 'error' | 'silent';
  mode?: string;
  force?: boolean;
  cssCodeSplit?: boolean;
  watch?: boolean | Record<string, unknown>;
  generatePackageJson?: boolean;
  includeDevDependenciesInPackageJson?: boolean;
}
