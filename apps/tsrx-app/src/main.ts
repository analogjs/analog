import { bootstrapApplication } from '@angular/platform-browser';

import { App } from './app/app.tsrx';
import { appConfig } from './app/app.config';

bootstrapApplication(App, appConfig).catch((error) => console.error(error));
