import type { ApplicationConfig } from '@angular/core';
import { provideFileRouter } from '@analogjs/router';

export const appConfig: ApplicationConfig = {
  providers: [provideFileRouter()],
};
