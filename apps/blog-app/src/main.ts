import 'zone.js';
import { bootstrapApplication } from '@angular/platform-browser';
import {
  provideContent,
  provideFileRouter,
  withMarkdownRenderer,
} from '@analogjs/router';

import { AppComponent } from './app/app.component';

bootstrapApplication(AppComponent, {
  providers: [provideFileRouter(), provideContent(withMarkdownRenderer())],
}).catch((err) => console.error(err));
