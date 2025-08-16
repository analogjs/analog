import 'zone.js';
import '@angular/compiler';
import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import AppComponent from './app/app.component.ag';

bootstrapApplication(AppComponent, appConfig).catch((err) =>
  console.error(err),
);
