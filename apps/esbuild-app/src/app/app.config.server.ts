import { mergeApplicationConfig } from '@angular/core';
import { provideAnalogServerRendering } from '@analogjs/router/ssr';
import routeFiles from 'analog:route-files';
import pageEndpoints from 'analog:page-endpoints';

import { appConfig } from './app.config';

// Endpoint-backed pages render per request automatically. fn-demo
// prerenders: its server function dispatches against the synthetic
// prerender request and the value is baked in (list a path in
// serverPaths instead when its server data must stay per-request).
export const config = mergeApplicationConfig(appConfig, {
  providers: [
    provideAnalogServerRendering(routeFiles, {
      pageEndpoints,
      debugRoutes: true,
    }),
  ],
});
