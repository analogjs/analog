import 'zone.js';
import { bootstrapApplication } from '@angular/platform-browser';
import { withInMemoryScrolling } from '@angular/router';
import { provideFileRouter } from '@analogjs/router';
import { provideContent, withMarkdownRenderer } from '@analogjs/content';
import { AppComponent } from './app/app.component';

bootstrapApplication(AppComponent, {
  providers: [
    provideFileRouter(withInMemoryScrolling({ anchorScrolling: 'enabled' })),
    provideContent(withMarkdownRenderer()),
  ],
}).catch((err) => console.error(err));
