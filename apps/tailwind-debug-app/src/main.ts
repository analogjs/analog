import 'zone.js';
import { bootstrapApplication } from '@angular/platform-browser';

import { AppComponent } from './app/app.component';
import { appConfig } from './app/app.config';
import { setupBrowserDiagnostics } from './app/debug/hmr-diagnostics';
import './routeTree.gen';

if (import.meta.env.DEV && typeof window !== 'undefined') {
  setupBrowserDiagnostics(import.meta.hot, window, window.sessionStorage);
}

bootstrapApplication(AppComponent, appConfig).catch((err) =>
  console.error(err),
);
