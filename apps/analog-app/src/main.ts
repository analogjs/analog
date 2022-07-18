import './polyfills';
import { enableProdMode } from '@angular/core';
import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';

import { AppModule } from './app/app.module';

if (import.meta.env.PROD) {
  enableProdMode();
}

if (import.meta.hot) {
  import('@angular-devkit/build-angular/src/webpack/plugins/hmr/hmr-accept')
    .then(m => m.default(import.meta));
}

platformBrowserDynamic().bootstrapModule(AppModule)
  .catch(err => console.error(err));


/*
Copyright Google LLC. All Rights Reserved.
Use of this source code is governed by an MIT-style license that
can be found in the LICENSE file at https://angular.io/license
*/