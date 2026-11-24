import type { NitroEventHandler } from 'nitro/types';

import { getPageEndpoints } from '../get-page-endpoints.js';

/**
 * Nitro event handlers for server-side page routes: each discovered page
 * endpoint, mounted under `/api/_analog`.
 */
export function getPageHandlers(
  args: Parameters<typeof getPageEndpoints>[0],
): NitroEventHandler[] {
  return getPageEndpoints(args).map(({ file, route }) => ({
    handler: file,
    route: `/api/_analog${route}`,
    lazy: true,
  }));
}
