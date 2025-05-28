import 'zone.js';
import { bootstrapApplication } from '@angular/platform-browser';

__APP_COMPONENT_IMPORT__
import { appConfig } from './app/app.config';

bootstrapApplication(__APP_COMPONENT__, appConfig);
