import { InjectionToken } from '@angular/core';

export const CUSTOM_CONTENT_SLUG_TOKEN = new InjectionToken<string>(
  '@analogjs/content Custom Slug Token',
  {
    providedIn: 'root',
    factory() {
      return '';
    },
  }
);
