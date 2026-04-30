import 'zone.js/node';
import '@angular/platform-server/init';
import { renderToStringFast } from '@analogjs/router/server';

import { config } from './app/app.config.server';
import { AppComponent } from './app/app.component';

export default renderToStringFast(AppComponent, config);
