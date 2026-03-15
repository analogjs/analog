import { convertNxExecutor } from '@nx/devkit';

import viteBuildExecutor from './vite.impl';

const compat: ReturnType<typeof convertNxExecutor> =
  convertNxExecutor(viteBuildExecutor);
export default compat;
