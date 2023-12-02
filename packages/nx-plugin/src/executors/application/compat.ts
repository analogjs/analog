import { convertNxExecutor } from '@nx/devkit';

import applicationExecutor from './application.impl';

export default convertNxExecutor(applicationExecutor);
