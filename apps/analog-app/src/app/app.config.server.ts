import type { ApplicationConfig } from '@angular/core';
import { mergeApplicationConfig } from '@angular/core';
import { provideServerRendering } from '@angular/platform-server';
import {
  provideServerFns,
  withServerFnInterceptors,
} from '@analogjs/router/server';

import { appConfig } from './app.config';
import { authInterceptor } from './server-fns/auth.interceptor';

const serverConfig: ApplicationConfig = {
  providers: [
    provideServerRendering(),
    // Server-function interceptors live in the server config — the same config
    // the dispatch endpoint bootstraps — so there is one DI surface, not two.
    provideServerFns(withServerFnInterceptors([authInterceptor])),
  ],
};

export const config = mergeApplicationConfig(appConfig, serverConfig);
