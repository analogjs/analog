import { convertNxExecutor } from '@nx/devkit';

import viteBuildExecutor from './vite.impl';

export default convertNxExecutor(viteBuildExecutor);
