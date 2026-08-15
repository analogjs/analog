import { mergeApplicationConfig } from '@angular/core';
import { provideAnalogServerRendering } from '@analogjs/router/ssr';

import { appConfig } from './app.config';

// Endpoint-backed pages render per request automatically; server-fn
// pages prerender with their values baked in (list a path in
// serverPaths when its server data must stay per-request).
export const config = mergeApplicationConfig(appConfig, {
  providers: [provideAnalogServerRendering({ debugRoutes: true })],
});
