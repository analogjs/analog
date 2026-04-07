import 'zone.js/node';
import '@angular/platform-server/init';
import { renderToString } from '@analogjs/router/server';

import { config } from './app/app.config.server';
import { AppComponent } from './app/app.component';

export default renderToString(AppComponent, config);
