import 'zone.js/node';
import { enableProdMode } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';

import { config } from './app/app.config.server';
import { AppComponent } from './app/app.component';

// if (import.meta.env.PROD) {
enableProdMode();
// }

export default function bootstrap() {
  return bootstrapApplication(AppComponent, config);
}
