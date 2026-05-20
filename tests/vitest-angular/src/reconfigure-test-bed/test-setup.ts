import { setupTestBed } from '@analogjs/vitest-angular/setup-testbed';
import { MY_TOKEN } from './my-token';

setupTestBed();

setupTestBed({
  providers: [{ provide: MY_TOKEN, useValue: 'My Value' }],
});
