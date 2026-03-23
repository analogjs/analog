import { InjectionToken, makeEnvironmentProviders } from '@angular/core';

export const MY_TOKEN = new InjectionToken<string>('MY_TOKEN');

export const MY_OTHER_TOKEN = new InjectionToken<string>('MY_OTHER_TOKEN');

export const provideOtherTokenValue = (value: string) =>
  makeEnvironmentProviders([{ provide: MY_OTHER_TOKEN, useValue: value }]);
