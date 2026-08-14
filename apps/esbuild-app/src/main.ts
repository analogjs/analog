import { Component, provideZonelessChangeDetection } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { RouterOutlet } from '@angular/router';
import { provideFileRouter, withRouteFiles } from '@analogjs/router';
import {
  provideContent,
  provideContentFiles,
  withMarkdownRenderer,
} from '@analogjs/content';
import routeFiles from 'analog:route-files';
import { contentFilesList, contentFiles } from 'analog:content-files';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  template: '<router-outlet />',
})
export class AppComponent {}

bootstrapApplication(AppComponent, {
  providers: [
    provideZonelessChangeDetection(),
    provideFileRouter(withRouteFiles(routeFiles)),
    provideContent(withMarkdownRenderer()),
    provideContentFiles({ list: contentFilesList, files: contentFiles }),
  ],
}).catch((err) => console.error(err));
