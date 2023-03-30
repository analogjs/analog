import 'zone.js';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideHttpClient } from '@angular/common/http';
import { provideFileRouter } from '@analogjs/router';

import { AppComponent } from './app/app.component';

bootstrapApplication(AppComponent, {
  providers: [provideFileRouter(), provideHttpClient()],
}).catch((err) => console.error(err));
