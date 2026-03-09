import { inferAsyncReturnType } from '@trpc/server';
import type { H3Event } from 'h3';

/**
 * Creates context for an incoming request
 * @link https://trpc.io/docs/context
 */
export const createContext = async (event: H3Event) => {
  // Create your context based on the request object
  // Will be available as `ctx` in all your resolvers
  const authorization = event.req.headers.get('authorization');
  const token = authorization?.split(' ')[1]?.trim();

  return {
    hasAuth: Boolean(token),
  };
};
export type Context = inferAsyncReturnType<typeof createContext>;
