import 'zone.js';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideFileRouter } from '@analogjs/router';
import { provideContent, withMarkdownRenderer } from '@analogjs/content';
import { AppComponent } from './app/app.component';

bootstrapApplication(AppComponent, {
  providers: [provideFileRouter(), provideContent(withMarkdownRenderer())],
}).catch((err) => console.error(err));
