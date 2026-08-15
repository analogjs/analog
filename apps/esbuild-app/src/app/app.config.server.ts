import { mergeApplicationConfig } from '@angular/core';
import { provideAnalogServerRendering } from '@analogjs/router/ssr';

import { appConfig } from './app.config';

// Endpoint-backed pages render per request automatically; server-fn
// pages prerender with their values baked in (list a path in
// serverPaths when its server data must stay per-request). stream-demo
// renders per request through the streaming renderer.
export const config = mergeApplicationConfig(appConfig, {
  providers: [
    provideAnalogServerRendering({
      serverPaths: ['stream-demo'],
      debugRoutes: true,
      // One prerendered page per content file: src/content/about.md
      // becomes /blog/about.
      prerenderContent: [{ contentDir: 'src/content', route: 'blog/:slug' }],
    }),
  ],
});
