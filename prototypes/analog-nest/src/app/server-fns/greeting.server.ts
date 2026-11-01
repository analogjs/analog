import { serverFn } from '@analogjs/router/server';
import { inject } from '@angular/core';
import * as v from 'valibot';

import { injectNest } from '../../analog-nest/nest-app';
import { GreetingService } from '../../server/greeting.service';

export const greet = serverFn(
  v.object({ name: v.string() }),
  async ({ name }) => injectNest(GreetingService).greet(name),
);
