import { setupTestBed } from '@analogjs/vitest-angular/setup-testbed';
import { MY_TOKEN, provideOtherTokenValue } from './my-token';

setupTestBed({
  providers: [
    { provide: MY_TOKEN, useValue: 'My Value' },
    provideOtherTokenValue('My Other Value'),
  ],
});
