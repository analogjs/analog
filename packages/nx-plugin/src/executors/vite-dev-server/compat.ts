import { convertNxExecutor } from '@nx/devkit';

import viteDevServerExecutor from './vite-dev-server.impl';

const compat: ReturnType<typeof convertNxExecutor> = convertNxExecutor(
  viteDevServerExecutor,
);
export default compat;
