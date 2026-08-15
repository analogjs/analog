import {
  bootstrapApplication,
  type BootstrapContext,
} from '@angular/platform-browser';
import { mergeApplicationConfig } from '@angular/core';
import {
  provideServerRendering,
  withRoutes,
  RenderMode,
  type ServerRoute,
} from '@angular/ssr';
import { createServerRoutePaths } from '@analogjs/router';
import { provideServerRequestContext } from '@analogjs/router/ssr';
import routeFiles from 'analog:route-files';

import { AppComponent } from './app/app.component';
import { appConfig } from './app/app.config';

// Static paths prerender. Dynamic module-backed paths prerender the
// parameter sets their routeMeta.getPrerenderParams provides and fall
// back to per-request rendering for anything else; dynamic paths with
// no module render per request. Endpoint-backed pages (feedback) render
// per request — their load resolver fetches the live page endpoint,
// which is unavailable while prerendering.
const serverRoutes: ServerRoute[] = createServerRoutePaths(routeFiles).map(
  (route) =>
    route.path === 'feedback'
      ? { path: route.path, renderMode: RenderMode.Server }
      : !route.isDynamic
        ? { path: route.path, renderMode: RenderMode.Prerender }
        : route.getPrerenderParams
          ? {
              path: route.path,
              renderMode: RenderMode.Prerender,
              getPrerenderParams: route.getPrerenderParams,
            }
          : { path: route.path, renderMode: RenderMode.Server },
);

export default function bootstrap(context: BootstrapContext) {
  return bootstrapApplication(
    AppComponent,
    mergeApplicationConfig(appConfig, {
      providers: [
        provideServerRendering(withRoutes(serverRoutes)),
        provideServerRequestContext(),
      ],
    }),
    context,
  );
}
