import 'zone.js/node';
import { enableProdMode } from '@angular/core';
import { renderApplication } from '@angular/platform-server';
import {
  provideContent,
  provideFileRouter,
  withMarkdownRenderer,
} from '@analogjs/router';
import { withEnabledBlockingInitialNavigation } from '@angular/router';

import { AppComponent } from './app/app.component';

if (import.meta.env.PROD) {
  enableProdMode();
}

export default async function render(url: string, document: string) {
  const html = await renderApplication(AppComponent, {
    appId: 'blog-app',
    document,
    url,
    providers: [
      provideFileRouter(withEnabledBlockingInitialNavigation()),
      provideContent(withMarkdownRenderer()),
    ],
  });

  return html;
}
