import type { FileReplacement } from '@nx/vite/plugins/rollup-replace-files.plugin';
export { ViteBuildExecutorOptions } from '@nx/vite/executors';

export interface ViteBuildSchema {
  configFile?: string;
  outputPath: string;
}
