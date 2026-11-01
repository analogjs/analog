import { serverFn } from '@analogjs/router/server';
import * as v from 'valibot';

/** Uses only Analog, so it works on any host. */
export const shout = serverFn(
  v.object({ text: v.string() }),
  async ({ text }) => ({ text: text.toUpperCase() }),
);
