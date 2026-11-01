import { serverFn } from '@analogjs/router/server';
import * as v from 'valibot';

import { injectNest } from '../../server/inject-nest';
import { GreetingService } from '../../server/greeting.service';

export const greet = serverFn(
  v.object({ name: v.string() }),
  async ({ name }) => injectNest(GreetingService).greet(name),
);
