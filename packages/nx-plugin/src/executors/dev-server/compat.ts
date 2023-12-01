import { convertNxExecutor } from '@nx/devkit';

import devServerExecutor from './executor';

export default convertNxExecutor(devServerExecutor);
