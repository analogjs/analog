import './polyfills';
import { enableProdMode } from '@angular/core';
import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';

import { AppModule } from './app/app.module';

if (import.meta.env.PROD) {
  enableProdMode();
}

platformBrowserDynamic()
  .bootstrapModule(AppModule)
  .then(() => {
    if (import.meta.hot) {
      // console.log(((window as any).ng));
      import.meta.hot.accept((newMod) => {
        import(
          '@angular-devkit/build-angular/src/webpack/plugins/hmr/hmr-accept'
        ).then((m) => m.default(import.meta));
      });
    }
  })
  .catch((err) => console.error(err));

/*
Copyright Google LLC. All Rights Reserved.
Use of this source code is governed by an MIT-style license that
can be found in the LICENSE file at https://angular.io/license
*/
