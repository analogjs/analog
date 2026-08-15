import { mergeApplicationConfig } from '@angular/core';
import { provideAnalogServerRendering } from '@analogjs/router/ssr';

import { appConfig } from './app.config';

// Endpoint-backed pages render per request automatically; pages that
// need the live request declare `routeMeta.prerender: false` themselves
// (see stream-demo.page.ts).
export const config = mergeApplicationConfig(appConfig, {
  providers: [
    provideAnalogServerRendering({
      debugRoutes: true,
      // One prerendered page per content file: src/content/about.md
      // becomes /blog/about.
      prerenderContent: [{ contentDir: 'src/content', route: 'blog/:slug' }],
    }),
  ],
});
