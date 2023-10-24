import { convertNxExecutor } from '@nx/devkit';

import viteDevServerExecutor from './vite-dev-server.impl';

export default convertNxExecutor(viteDevServerExecutor);
