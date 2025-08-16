import { router } from '../trpc';
import { noteRouter } from './notes';

export const appRouter = router({
  note: noteRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;

// Also export createCaller for server-side usage
export const createCaller = appRouter.createCaller;
