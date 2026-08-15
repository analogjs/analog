import {
  ApplicationConfig,
  provideZonelessChangeDetection,
} from '@angular/core';
import { provideHttpClient, withFetch } from '@angular/common/http';
import {
  provideClientHydration,
  withIncrementalHydration,
} from '@angular/platform-browser';
import {
  provideFileRouter,
  withDebugRoutes,
  withPageEndpoints,
  withRouteFiles,
} from '@analogjs/router';
import {
  provideContent,
  provideContentFiles,
  withMarkdownRenderer,
} from '@analogjs/content';
import routeFiles from 'analog:route-files';
import { contentFilesList, contentFiles } from 'analog:content-files';
import pageEndpoints from 'analog:page-endpoints';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    provideClientHydration(withIncrementalHydration()),
    provideHttpClient(withFetch()),
    provideFileRouter(
      withRouteFiles(routeFiles),
      withPageEndpoints(pageEndpoints),
      withDebugRoutes(),
    ),
    provideContent(
      withMarkdownRenderer({ loadMermaid: () => import('mermaid') }),
    ),
    provideContentFiles({ list: contentFilesList, files: contentFiles }),
  ],
};
