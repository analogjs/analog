import type { ApplicationConfig } from '@angular/core';
import { mergeApplicationConfig } from '@angular/core';
import { RenderMode } from '@angular/ssr';
import {
  provideAnalogServerRendering,
  withConfig,
  withRoutes,
} from '@analogjs/router/ssr';
import {
  provideServerFns,
  withServerFnInterceptors,
} from '@analogjs/router/server';

import { appConfig } from './app.config';
import { authInterceptor } from './server-fns/auth.interceptor';

// Server config for the esbuild application builder (`build-ng`). The
// Vite/Nitro path keeps using app.config.server.ts; this one derives
// the @angular/ssr server routes from the discovered files and covers
// the extra routes app.config registers outside the file map.
export const config: ApplicationConfig = mergeApplicationConfig(appConfig, {
  providers: [
    provideAnalogServerRendering(
      withConfig({ debugRoutes: true }),
      // withExtraRoutes fallback in app.config.ts
      withRoutes([{ path: 'about', renderMode: RenderMode.Server }]),
    ),
    // Same server-function DI surface as the Nitro path's server config.
    provideServerFns(withServerFnInterceptors([authInterceptor])),
  ],
});
