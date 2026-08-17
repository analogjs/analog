import { mergeApplicationConfig } from '@angular/core';
import { provideAnalogServerRendering, withConfig } from '@analogjs/router/ssr';

import { appConfig } from './app.config';

// Endpoint-backed pages render per request automatically; everything
// else a page decides itself in routeMeta — prerender: false for the
// live request (stream-demo), fromContentDir for content-driven
// prerendering (blog/[slug]).
export const config = mergeApplicationConfig(appConfig, {
  providers: [provideAnalogServerRendering(withConfig({ debugRoutes: true }))],
});
