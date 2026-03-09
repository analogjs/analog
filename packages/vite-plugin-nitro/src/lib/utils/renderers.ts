export const ssrRenderer = `
import { eventHandler, getResponseHeader } from 'h3';
// @ts-ignore
import renderer from '#analog/ssr';
// @ts-ignore
import template from '#analog/index';

export default eventHandler(async (event) => {
  const noSSR = getResponseHeader(event, 'x-analog-no-ssr');

  if (noSSR === 'true') {
    return template;
  }

  const html = await renderer(event.node.req.url, template, {
    req: event.node.req,
    res: event.node.res,
  });

  return html;
});`;

export const clientRenderer = `
import { eventHandler } from 'h3';

// @ts-ignore
import template from '#analog/index';

export default eventHandler(async () => {
  return template;
});
`;

export const apiMiddleware = `
import { eventHandler, proxyRequest } from 'h3';
import { useRuntimeConfig } from '#imports';

export default eventHandler(async (event) => {
  const prefix = useRuntimeConfig().prefix;
  const apiPrefix = \`\${prefix}/\${useRuntimeConfig().apiPrefix}\`;

  if (event.node.req.url?.startsWith(apiPrefix)) {
    const reqUrl = event.node.req.url?.replace(apiPrefix, '');

    if (
      event.node.req.method === 'GET' &&
      // in the case of XML routes, we want to proxy the request so that nitro gets the correct headers
      // and can render the XML correctly as a static asset
      !event.node.req.url?.endsWith('.xml')
    ) {
      return $fetch(reqUrl, { headers: event.node.req.headers });
    }

    return proxyRequest(event, reqUrl, {
      // @ts-ignore
      fetch: $fetch.native,
    });
  }
});`;
