import './polyfills';
import { enableProdMode } from '@angular/core';
import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';
import initHmr from '@angular-devkit/build-angular/src/webpack/plugins/hmr/hmr-accept';
import { AppModule } from './app/app.module';

if (import.meta.env.PROD) {
  enableProdMode();
}

platformBrowserDynamic()
  .bootstrapModule(AppModule)
  .catch((err) => console.error(err));

if (import.meta.hot) {
  import.meta.hot.accept((newMod) => {
    initHmr(import.meta);
  });
}  
