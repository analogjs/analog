import { mergeApplicationConfig, ApplicationConfig } from '@angular/core';
import { provideServerRendering } from '@angular/platform-server';

import { appConfig } from './app.config';
import { SERVER_LABEL } from './server-label';

const serverConfig: ApplicationConfig = {
  providers: [
    provideServerRendering(),
    { provide: SERVER_LABEL, useValue: 'configured-server' },
  ],
};

export const config = mergeApplicationConfig(appConfig, serverConfig);
