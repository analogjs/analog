import 'zone.js/node';
import {
  renderApplication,
  ɵSERVER_CONTEXT as SERVER_CONTEXT,
} from '@angular/platform-server';
import { provideFileRouter } from '@analogjs/router';
import { withEnabledBlockingInitialNavigation } from '@angular/router';

import { AppComponent } from './app/app.component';
import { enableProdMode } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';

if (import.meta.env.PROD) {
  enableProdMode();
}

export default async function render(url: string, document: string) {
  const bootstrap = () =>
    bootstrapApplication(AppComponent, {
      providers: [
        provideFileRouter(withEnabledBlockingInitialNavigation()),
        { provide: SERVER_CONTEXT, useValue: 'ssr-analog' },
      ],
    });

  const html = await renderApplication(bootstrap, {
    // appId: 'analog-app',
    document,
    url,
  });

  return html;
}
