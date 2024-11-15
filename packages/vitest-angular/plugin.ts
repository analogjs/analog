import { getOutputFiles } from './utils';

import { createAngularMemoryPlugin } from './src/lib/test-application/plugins/angular-memory-plugin';
import { esbuildDownlevelPlugin } from './src/lib/test-application/plugins/esbuild-downlevel-plugin';

export function angularVitest() {
  const outputFiles = getOutputFiles();

  return [
    createAngularMemoryPlugin({
      outputFiles,
    }),
    esbuildDownlevelPlugin(),
  ];
}
