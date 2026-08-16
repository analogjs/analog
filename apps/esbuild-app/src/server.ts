import { createAnalogRequestHandler } from '@analogjs/router/api';

import { AppComponent } from './app/app.component';
import { config } from './app/app.config.server';

export const reqHandler = createAnalogRequestHandler({
  config,
  main: import.meta.url,
  // Pages opt in with routeMeta.streaming; renderStream needs the root
  // component because it drives the platform itself.
  streaming: { component: AppComponent },
});
