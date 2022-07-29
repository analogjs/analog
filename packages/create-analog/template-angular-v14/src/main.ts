import './polyfills';
import { enableProdMode } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';

import { AppComponent } from './app/app.component';

if (import.meta.env.PROD) {
  enableProdMode();
}

bootstrapApplication(AppComponent);
