import { provideZonelessChangeDetection } from '@angular/core';
import {
  bootstrapApplication,
  provideClientHydration,
  withIncrementalHydration,
} from '@angular/platform-browser';
import { App } from './app/app';
import { PROBE_ID } from './app/probe';

bootstrapApplication(App, {
  providers: [
    provideZonelessChangeDetection(),
    provideClientHydration(withIncrementalHydration()),
    {
      provide: PROBE_ID,
      useValue: new URL(location.href).searchParams.get('id') ?? 'normal',
    },
  ],
});
