import { createAnalogRequestHandler } from '@analogjs/router/api';
import apiRoutes from 'analog:api-routes';
import pageEndpoints from 'analog:page-endpoints';
import serverFns from 'analog:server-fns';

import { config } from './app/app.config.server';

export const reqHandler = createAnalogRequestHandler({
  apiRoutes,
  pageEndpoints,
  serverFns,
  config,
  main: import.meta.url,
});
