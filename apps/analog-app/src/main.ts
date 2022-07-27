import './polyfills';
import { enableProdMode, importProvidersFrom } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { HttpClientModule } from '@angular/common/http';
import { RouterModule } from '@angular/router';

import initHmr from '@angular-devkit/build-angular/src/webpack/plugins/hmr/hmr-accept';

import { AppComponent } from './app/app.component';
import { routes } from './app/routes';

if (import.meta.env.PROD) {
  enableProdMode();
}

bootstrapApplication(AppComponent, {
  providers: [
    importProvidersFrom(
      HttpClientModule,
      RouterModule.forRoot(routes)
    ),
  ],
}).catch((err) => console.error(err));

if (!import.meta.env.PROD && import.meta.hot) {
  import.meta.hot.accept((newMod) => {
    initHmr(import.meta);
  });
}
