import {
  bootstrapApplication,
  type BootstrapContext,
} from '@angular/platform-browser';

import { AppComponent } from './app/app.component';
import { config } from './app/app.config.server';

export default (context: BootstrapContext) =>
  bootstrapApplication(AppComponent, config, context);
