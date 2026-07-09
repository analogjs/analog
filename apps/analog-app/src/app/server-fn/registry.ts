import type { ServerFnDef } from './types';

/**
 * Server-side registry of server functions, keyed by id. A `.server.ts` module
 * populates it as a side effect of `serverFn(...)` running at import time; the
 * Nitro dispatch route imports those modules to fill it, then looks up by id.
 */
export const serverFnRegistry = new Map<string, ServerFnDef>();
