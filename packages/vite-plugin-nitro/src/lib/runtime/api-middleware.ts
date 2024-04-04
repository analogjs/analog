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
      return $fetch(reqUrl, {
        headers: event.node.req.headers,
        context: event.context,
      });
    }

    return proxyRequest(event, reqUrl, {
      // @ts-ignore
      fetch: $fetch.native,
    });
  }
});
