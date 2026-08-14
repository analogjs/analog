import { bootstrapApplication } from '@angular/platform-browser';
import { provideRouter, Routes } from '@angular/router';
import routeFiles from 'analog:route-files';
import { contentFilesList, contentFiles } from 'analog:content-files';

import { AppComponent } from './app/app.component';

// Mirrors what createRoutes does with the discovered files map: every
// entry becomes a lazily loaded route, so esbuild must code-split each
// page and markdown file into its own chunk.
const routes: Routes = Object.keys(routeFiles).map((filename) => ({
  path: filename,
  loadComponent: () =>
    routeFiles[filename]().then((m) => (m as { default: never }).default),
}));

(globalThis as Record<string, unknown>)['__analogFixture'] = {
  routeKeys: Object.keys(routeFiles),
  contentList: contentFilesList,
  loadContent: () => contentFiles['/src/content/about.md'](),
};

bootstrapApplication(AppComponent, {
  providers: [provideRouter(routes)],
});
