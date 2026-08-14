import {
  bootstrapApplication,
  type BootstrapContext,
} from '@angular/platform-browser';
import {
  provideServerRendering,
  withRoutes,
  RenderMode,
  type ServerRoute,
} from '@angular/ssr';
import {
  createRoutePaths,
  provideFileRouter,
  withRouteFiles,
} from '@analogjs/router';
import {
  provideContent,
  provideContentFiles,
  withMarkdownRenderer,
} from '@analogjs/content';
import routeFiles from 'analog:route-files';
import { contentFilesList, contentFiles } from 'analog:content-files';

import { AppComponent } from './app/app.component';

// Static paths prerender; paths with parameters or wildcards are
// rendered per request, since their values are not known at build time.
const serverRoutes: ServerRoute[] = createRoutePaths(routeFiles as never).map(
  (path) =>
    path.includes(':') || path.includes('*')
      ? { path, renderMode: RenderMode.Server }
      : { path, renderMode: RenderMode.Prerender },
);

export default function bootstrap(context: BootstrapContext) {
  return bootstrapApplication(
    AppComponent,
    {
      providers: [
        provideServerRendering(withRoutes(serverRoutes)),
        provideFileRouter(withRouteFiles(routeFiles as never)),
        provideContent(withMarkdownRenderer()),
        provideContentFiles({ list: contentFilesList, files: contentFiles }),
      ],
    },
    context,
  );
}
