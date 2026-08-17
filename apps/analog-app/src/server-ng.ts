import { createAnalogRequestHandler } from '@analogjs/router/ssr';

import { config } from './app/app.config.server-ng';

export const reqHandler = createAnalogRequestHandler({
  config,
  main: import.meta.url,
});
