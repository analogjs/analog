import 'zone.js/node';
import { renderApplication } from '@angular/platform-server';
import { provideFileRouter, routes } from '@analogjs/router';
import { withEnabledBlockingInitialNavigation } from '@angular/router';

import { AppComponent } from './app/app.component';
import { enableProdMode } from '@angular/core';

if (import.meta.env.PROD) {
  enableProdMode();
}

export default async function render(url: string, document: string) {
  const html = await renderApplication(AppComponent, {
    appId: 'blog-app',
    document,
    url,
    providers: [provideFileRouter(withEnabledBlockingInitialNavigation())],
  });

  return html;
}
