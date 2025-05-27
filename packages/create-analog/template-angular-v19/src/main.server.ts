import 'zone.js/node';
import '@angular/platform-server/init';
import { render } from '@analogjs/router/server';

__APP_COMPONENT_IMPORT__
import { config } from './app/app.config.server';

export default render(__APP_COMPONENT__, config);
