import './polyfills';
import { enableProdMode, importProvidersFrom } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { HttpClientModule } from '@angular/common/http';
import { provideFileRouter, routes } from '@analogjs/router';

import { AppComponent } from './app/app.component';

if (import.meta.env.PROD) {
  enableProdMode();
}
console.log(routes);
bootstrapApplication(AppComponent, {
  providers: [provideFileRouter(), importProvidersFrom(HttpClientModule)],
}).catch((err) => console.error(err));
