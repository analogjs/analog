import 'zone.js';
import { bootstrapApplication } from '@angular/platform-browser';
import { environment } from './environments/environment';
import { AppComponent } from './app/app.component';
import { appConfig } from './app/app.config';

if (!environment.production) {
  console.log('dev mode');
}

bootstrapApplication(AppComponent, appConfig);
