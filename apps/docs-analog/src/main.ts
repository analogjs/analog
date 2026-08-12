import 'zone.js';
// Defines globalThis.$localize so templates compiled with `i18n` markers
// can resolve translations registered by provideI18n() at runtime.
import '@angular/localize/init';
import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component';
import { appConfig } from './app/app.config';

bootstrapApplication(AppComponent, appConfig);
