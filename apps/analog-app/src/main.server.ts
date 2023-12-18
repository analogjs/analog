import 'zone.js/node';
import { InjectionToken, enableProdMode } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { renderApplication } from '@angular/platform-server';

import { config } from './app/app.config.server';
import { AppComponent } from './app/app.component';

if (import.meta.env.PROD) {
  enableProdMode();
}

const REQUEST = new InjectionToken<Request>('REQUEST');
const RESPONSE = new InjectionToken<Response>('RESPONSE');

export function bootstrap() {
  return bootstrapApplication(AppComponent, config);
}

export default async function render(
  url: string,
  document: string,
  req: Request,
  res: Response
) {
  const html = await renderApplication(bootstrap, {
    document,
    url,
    platformProviders: [
      { provide: REQUEST, useValue: req },
      { provide: RESPONSE, useValue: res },
    ],
  });

  return html;
}
