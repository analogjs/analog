/**
 * This file is written in JavaScript
 * because it is used by Nitro to build
 * the renderer for SSR.
 *
 * The package is shipped as commonjs
 * which won't be parsed by Nitro correctly.
 */
import { eventHandler, proxyRequest } from 'h3';

export default eventHandler(async (event) => {
  const apiPrefix = `/${import.meta.env.RUNTIME_CONFIG?.apiPrefix ?? 'api'}`;
  if (event.node.req.url?.startsWith(apiPrefix)) {
    return proxyRequest(
      event,
      `${event.node.req.url?.replace(apiPrefix, '')}`,
      {
        fetch: $fetch.native,
      }
    );
  }
});
