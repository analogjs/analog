import { SourceFileCache } from './source-file-cache';

export interface CompilerPluginOptions {
  sourcemap: boolean;
  tsconfig: string;
  jit?: boolean;
  /** Skip TypeScript compilation setup. This is useful to re-use the TypeScript compilation from another plugin. */
  noopTypeScriptCompilation?: boolean;
  advancedOptimizations?: boolean;
  thirdPartySourcemaps?: boolean;
  fileReplacements?: Record<string, string>;
  sourceFileCache?: SourceFileCache;
  // loadResultCache?: LoadResultCache;
  incremental: boolean;
}
