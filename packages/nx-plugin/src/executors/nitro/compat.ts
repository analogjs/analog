import { convertNxExecutor } from '@nx/devkit';

import nitroExecutor from './nitro.impl';

export default convertNxExecutor(nitroExecutor);
