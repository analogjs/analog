import { createAnalogRequestHandler } from '@analogjs/router/api';

import { config } from './app/app.config.server';

export const reqHandler = createAnalogRequestHandler({
  config,
  main: import.meta.url,
});
