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

export const ssrStreamRenderer = `
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

  // renderer (main.server.ts default export via renderStream) returns a
  // ReadableStream that flushes the head first, then each @defer block as it
  // resolves. Returning the stream from the handler streams it to the client.
  const stream = await renderer(event.node.req.url, template, {
    req: event.node.req,
    res: event.node.res,
  });

  setResponseHeader(event, 'content-type', 'text/html;charset=utf-8');

  // A \`streaming: false\` route rule sets this header; renderStream then emits
  // the buffered render() output as a single chunk. Collect it into a string so
  // the response is a normal buffered document (content-length), not chunked.
  const noStreaming = getResponseHeader(event, 'x-analog-no-streaming');
  if (noStreaming === 'true') {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let html = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      html += decoder.decode(value, { stream: true });
    }
    html += decoder.decode();
    return html;
  }

  // Let the runtime frame the response (h3 sets chunked TE for the Node preset;
  // HTTP/2 and edge runtimes forbid an explicit Transfer-Encoding header).
  return stream;
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
import { createError, eventHandler, proxyRequest } from 'h3';
import { useRuntimeConfig } from '#imports';

export default eventHandler(async (event) => {
  const prefix = useRuntimeConfig().prefix;
  const apiPrefix = \`\${prefix}/\${useRuntimeConfig().apiPrefix}\`;

  const url = event.node.req.url || '';

  // only match the prefix on a path boundary, otherwise a URL such as
  // '/apihttp://internal-host' would pass startsWith() and be forwarded verbatim
  if (
    url === apiPrefix ||
    url.startsWith(\`\${apiPrefix}/\`) ||
    url.startsWith(\`\${apiPrefix}?\`)
  ) {
    let reqUrl = url.slice(apiPrefix.length);
    if (reqUrl === '' || reqUrl.startsWith('?')) {
      reqUrl = \`/\${reqUrl}\`;
    }

    // reject absolute and protocol-relative targets to prevent SSRF
    if (!reqUrl.startsWith('/') || reqUrl.startsWith('//')) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid API route' });
    }

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
