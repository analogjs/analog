import { bootstrapApplication } from '@angular/platform-browser';
import { provideFileRouter, withRouteFiles } from '@analogjs/router';
import {
  provideContent,
  provideContentFiles,
  withMarkdownRenderer,
} from '@analogjs/content';
import routeFiles from 'analog:route-files';
import { contentFilesList, contentFiles } from 'analog:content-files';

import { AppComponent } from './app/app.component';

bootstrapApplication(AppComponent, {
  providers: [
    provideFileRouter(withRouteFiles(routeFiles as never)),
    provideContent(withMarkdownRenderer()),
    provideContentFiles({ list: contentFilesList, files: contentFiles }),
  ],
});
