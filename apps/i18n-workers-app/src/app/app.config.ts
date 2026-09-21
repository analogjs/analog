import { ApplicationConfig } from '@angular/core';
import { provideFileRouter } from '@analogjs/router';
import { provideI18n } from '@analogjs/router/i18n';
import {
  provideClientHydration,
  withI18nSupport,
} from '@angular/platform-browser';
import load from '../i18n';
export const appConfig: ApplicationConfig = {
  providers: [
    provideFileRouter(),
    provideI18n({ loader: load }),
    provideClientHydration(withI18nSupport()),
  ],
};
