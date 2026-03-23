import type { ApplicationConfig } from '@angular/core';
import { mergeApplicationConfig } from '@angular/core';
import { provideServerRendering } from '@angular/platform-server';
import { provideServerAnalogQuery } from '@analogjs/router/query';

import { appConfig } from './app.config';

const serverConfig: ApplicationConfig = {
  providers: [provideServerRendering(), provideServerAnalogQuery()],
};

export const config = mergeApplicationConfig(appConfig, serverConfig);
