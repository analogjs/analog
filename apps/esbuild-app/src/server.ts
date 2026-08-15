import { createAnalogRequestHandler } from '@analogjs/router/api';

import { AppComponent } from './app/app.component';
import { config } from './app/app.config.server';

export const reqHandler = createAnalogRequestHandler({
  config,
  main: import.meta.url,
  streaming: { component: AppComponent, paths: ['/stream-demo'] },
});
