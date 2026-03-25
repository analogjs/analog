import 'zone.js/node';
import '@angular/compiler';
import '@angular/platform-server/init';
import { enableProdMode } from '@angular/core';
import {
  bootstrapApplication,
  type BootstrapContext,
} from '@angular/platform-browser';
import { renderApplication } from '@angular/platform-server';
import { provideServerContext } from '@analogjs/router/server';
import type { ServerContext } from '@analogjs/router/tokens';

import { config } from './app/app.config.server';
import { AppComponent } from './app/app.component';

if (import.meta.env.PROD) {
  enableProdMode();
}

export function bootstrap(context?: BootstrapContext) {
  return bootstrapApplication(AppComponent, config, context);
}

export default async function render(
  url: string,
  document: string,
  serverContext: ServerContext,
) {
  return renderApplication(bootstrap, {
    document,
    url,
    platformProviders: [provideServerContext(serverContext)],
  });
}
