import { createAnalogRequestHandler } from '@analogjs/router/api';
import apiRoutes from 'analog:api-routes';
import pageEndpoints from 'analog:page-endpoints';
// Registers every discovered *.server.ts server function by id.
import 'analog:server-fns';

import { config } from './app/app.config.server';

export const reqHandler = createAnalogRequestHandler({
  apiRoutes,
  pageEndpoints,
  serverFns: config,
  main: import.meta.url,
});
