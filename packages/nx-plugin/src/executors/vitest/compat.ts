import { convertNxExecutor } from '@nx/devkit';

import vitestExecutor from './vitest.impl';

const compat: ReturnType<typeof convertNxExecutor> =
  convertNxExecutor(vitestExecutor);
export default compat;
