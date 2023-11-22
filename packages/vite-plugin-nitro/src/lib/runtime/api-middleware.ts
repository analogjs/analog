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
  // @ts-ignore
  const apiPrefix = `/${import.meta.env.RUNTIME_CONFIG?.apiPrefix ?? 'api'}`;
  if (event.node.req.url?.startsWith(apiPrefix)) {
    const reqUrl = event.node.req.url?.replace(apiPrefix, '');

    if (
      event.node.req.method === 'GET' &&
      // in the case of XML routes, we want to proxy the request so that nitro gets the correct headers
      // and can render the XML correctly as a static asset
      !event.node.req.url?.endsWith('.xml')
    ) {
      return $fetch(reqUrl);
    }

    return proxyRequest(event, reqUrl, {
      // @ts-ignore
      fetch: $fetch.native,
    });
  }
});
