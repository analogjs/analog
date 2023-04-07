import 'zone.js';
import { bootstrapApplication } from '@angular/platform-browser';

import { AppComponent } from './app/app.component';
import { mainProviders } from './main.providers';

bootstrapApplication(AppComponent, {
  providers: [mainProviders],
}).catch((err) => console.error(err));
