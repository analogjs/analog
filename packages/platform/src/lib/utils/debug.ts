import { createDebug, enable } from 'obug';

export const debugPlatform = createDebug('analog:platform');
export const debugRoutes = createDebug('analog:platform:routes');
export const debugContent = createDebug('analog:platform:content');

/**
 * Translates the user-facing `debug` platform option into obug namespace
 * activations.  Called once during the Vite plugin config hook.
 *
 * When `true`, enables all `analog:*` scopes (platform + angular + nitro).
 * Additive — does not replace namespaces already enabled via the DEBUG
 * env var or localStorage.debug.
 */
export function applyDebugOption(debug: boolean | string[] | undefined): void {
  if (debug === true) {
    enable('analog:*');
  } else if (Array.isArray(debug) && debug.length) {
    enable(debug.join(','));
  }
}
