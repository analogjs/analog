import { createDebug } from 'obug';

export const debugNitro = createDebug('analog:nitro');
export const debugSsr = createDebug('analog:nitro:ssr');
export const debugPrerender = createDebug('analog:nitro:prerender');

/** All Nitro-related debug instances, for external wrapping (e.g. file logging). */
export const nitroDebugInstances = [debugNitro, debugSsr, debugPrerender];
