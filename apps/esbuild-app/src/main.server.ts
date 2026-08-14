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
import { createRoutePaths } from '@analogjs/router';
import routeFiles from 'analog:route-files';

import { AppComponent } from './app/app.component';
import { appConfig } from './app/app.config';

// Static paths prerender; paths with parameters or wildcards render per
// request, since their values are not known at build time.
const serverRoutes: ServerRoute[] = createRoutePaths(routeFiles).map((path) =>
  path.includes(':') || path.includes('*')
    ? { path, renderMode: RenderMode.Server }
    : { path, renderMode: RenderMode.Prerender },
);

export default function bootstrap(context: BootstrapContext) {
  return bootstrapApplication(
    AppComponent,
    mergeApplicationConfig(appConfig, {
      providers: [provideServerRendering(withRoutes(serverRoutes))],
    }),
    context,
  );
}
