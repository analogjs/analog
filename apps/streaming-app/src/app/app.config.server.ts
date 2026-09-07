import { mergeApplicationConfig, ApplicationConfig } from '@angular/core';
import { provideServerRendering } from '@angular/platform-server';
import { provideServerFns } from '@analogjs/router/server';

import { appConfig } from './app.config';

const serverConfig: ApplicationConfig = {
  providers: [provideServerRendering(), provideServerFns()],
};

export const config = mergeApplicationConfig(appConfig, serverConfig);
