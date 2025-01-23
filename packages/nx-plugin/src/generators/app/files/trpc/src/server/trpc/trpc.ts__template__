import { initTRPC } from '@trpc/server';
import { Context } from './context';
import { SuperJSON } from 'superjson';

const t = initTRPC.context<Context>().create({
  transformer: SuperJSON,
});
/**
 * Unprotected procedure
 **/
export const publicProcedure = t.procedure;
export const router = t.router;
export const middleware = t.middleware;
