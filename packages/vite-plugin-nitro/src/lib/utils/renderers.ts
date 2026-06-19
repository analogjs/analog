export const ssrRenderer = `
import { eventHandler, getResponseHeader, setResponseHeader } from 'h3';
// @ts-ignore
import renderer from '#analog/ssr';
// @ts-ignore
import template from '#analog/index';

export default eventHandler(async (event) => {
  const noSSR = getResponseHeader(event, 'x-analog-no-ssr');

  if (noSSR === 'true') {
    return template;
  }

  const result = await renderer(event.node.req.url, template, {
    req: event.node.req,
    res: event.node.res,
  });

  // Handle streaming responses (ReadableStream body)
  if (result instanceof Response && result.body instanceof ReadableStream) {
    const nodeRes = event.node.res;

    // Propagate status code from the Response
    nodeRes.statusCode = result.status;

    // Copy headers from the Response to the h3 event
    result.headers.forEach((value, key) => {
      if (key.toLowerCase() !== 'transfer-encoding') {
        setResponseHeader(event, key, value);
      }
    });

    // Set default Content-Type if not already set
    if (!nodeRes.getHeader('content-type')) {
      nodeRes.setHeader('Content-Type', 'text/html');
    }
    nodeRes.setHeader('Transfer-Encoding', 'chunked');

    const reader = result.body.getReader();
    const decoder = new TextDecoder();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        nodeRes.write(decoder.decode(value, { stream: true }));
      }
      nodeRes.end();
    } catch (streamError) {
      if (!nodeRes.destroyed) {
        nodeRes.destroy(streamError);
      }
    }

    return;
  }

  return result;
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
