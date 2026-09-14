import { createDebug, type Debugger } from 'obug';

export const debugNitro: Debugger = createDebug('analog:nitro');
export const debugSsr: Debugger = createDebug('analog:nitro:ssr');
export const debugPrerender: Debugger = createDebug('analog:nitro:prerender');

/** All Nitro-related debug instances, for external wrapping (e.g. file logging). */
export const nitroDebugInstances: Debugger[] = [
  debugNitro,
  debugSsr,
  debugPrerender,
];
