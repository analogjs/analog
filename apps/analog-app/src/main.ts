import 'zone.js';
import { importProvidersFrom } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { HttpClientModule } from '@angular/common/http';
import { provideFileRouter } from '@analogjs/router';

import { AppComponent } from './app/app.component';

bootstrapApplication(AppComponent, {
  providers: [provideFileRouter(), importProvidersFrom(HttpClientModule)],
}).catch((err) => console.error(err));
