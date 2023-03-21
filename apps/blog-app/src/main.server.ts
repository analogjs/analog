import 'zone.js/node';
import { enableProdMode } from '@angular/core';
import { renderApplication } from '@angular/platform-server';
import { provideContent, withMarkdownRenderer } from '@analogjs/content';
import { provideFileRouter } from '@analogjs/router';
import { withEnabledBlockingInitialNavigation } from '@angular/router';

import { AppComponent } from './app/app.component';
import { bootstrapApplication } from '@angular/platform-browser';

if (import.meta.env.PROD) {
  enableProdMode();
}

export default async function render(url: string, document: string) {
  const bootstrap = () =>
    bootstrapApplication(AppComponent, {
      providers: [
        provideFileRouter(withEnabledBlockingInitialNavigation()),
        provideContent(withMarkdownRenderer()),
      ],
    });

  const html = await renderApplication(bootstrap, {
    // appId: 'blog-app',
    document,
    url,
  });

  return html;
}
