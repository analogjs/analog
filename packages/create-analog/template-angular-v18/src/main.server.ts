import 'zone.js/node';
import '@angular/platform-server/init';
import { enableProdMode } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { renderApplication } from '@angular/platform-server';
import { provideServerContext } from '@analogjs/router/server';
import { ServerContext } from '@analogjs/router/tokens';

__APP_COMPONENT_IMPORT__
import { config } from './app/app.config.server';

if (import.meta.env.PROD) {
  enableProdMode();
}

export function bootstrap() {
  return bootstrapApplication(__APP_COMPONENT__, config);
}

export default async function render(
  url: string,
  document: string,
  serverContext: ServerContext
) {
  const html = await renderApplication(bootstrap, {
    document,
    url,
    platformProviders: [provideServerContext(serverContext)],
  });

  return html;
}
