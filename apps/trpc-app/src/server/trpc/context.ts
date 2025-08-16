import { inferAsyncReturnType } from '@trpc/server';
import { H3Event } from 'h3';

/**
 * Creates context for an incoming request
 * @link https://trpc.io/docs/context
 */
export const createContext = async (event: H3Event) => {
  // Create your context based on the request object
  // Will be available as `ctx` in all your resolvers
  const authorization = event.req.headers.get('authorization');
  return {
    hasAuth: authorization && authorization.split(' ')[1]?.length > 0,
  };
};
export type Context = inferAsyncReturnType<typeof createContext>;
