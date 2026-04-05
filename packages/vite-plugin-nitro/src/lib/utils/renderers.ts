/**
 * Code snippet emitted into virtual modules to create a request-scoped
 * fetch using ofetch's `createFetch` + h3's `fetchWithEvent`.
 *
 * Shared between the SSR renderer and page-endpoint virtual modules so
 * the fetch-wiring logic stays in sync.
 *
 * The emitted variable is named `serverFetch` — callers should reference it
 * by that name.
 */
export const SERVER_FETCH_FACTORY_SNIPPET = `
  const serverFetch = createFetch({
    fetch: (resource, init) => {
      const url = resource instanceof Request ? resource.url : resource.toString();
      return fetchWithEvent(event, url, init);
    }
  });`;

/**
 * SSR renderer virtual module content.
 *
 * This code runs inside Nitro's server runtime (Node.js context) where
 * event.node is always populated. In h3 v2, event.node is typed as optional,
 * so we use h3's first-class event properties (event.path, event.method) where
 * possible and apply optional chaining when accessing the Node.js context for
 * the Angular renderer which requires raw req/res objects.
 *
 * h3 v2 idiomatic APIs used:
 * - defineHandler (replaces defineEventHandler / eventHandler)
 * - event.path (replaces event.node.req.url)
 * - getResponseHeader compat shim (still available in h3 v2)
 */
export function ssrRenderer() {
  return `
import { createFetch } from 'ofetch';
import { defineHandler, fetchWithEvent } from 'nitro/h3';
// @ts-ignore
import renderer from '#analog/ssr';
import template from '#analog/index';

const normalizeHtmlRequestUrl = (url) =>
  url.replace(/\\/index\\.html(?=$|[?#])/, '/');

export default defineHandler(async (event) => {
  event.res.headers.set('content-type', 'text/html; charset=utf-8');
  const noSSR = event.res.headers.get('x-analog-no-ssr');
  const requestPath = normalizeHtmlRequestUrl(event.path);

  if (noSSR === 'true') {
    return template;
  }

  // event.path is the canonical h3 v2 way to access the request URL.
  // event.node?.req and event.node?.res are needed by the Angular SSR renderer
  // which operates on raw Node.js request/response objects.
  // During prerendering (Nitro v3 fetch-based pipeline), event.node is undefined.
  // The Angular renderer requires a req object with at least { headers, url },
  // so we provide a minimal stub to avoid runtime errors in prerender context.
  const req = event.node?.req
    ? {
        ...event.node.req,
        url: requestPath,
        originalUrl: requestPath,
      }
    : {
    headers: { host: 'localhost' },
    url: requestPath,
    originalUrl: requestPath,
    connection: {},
  };
  const res = event.node?.res;
${SERVER_FETCH_FACTORY_SNIPPET}

  const html = await renderer(requestPath, template, { req, res, fetch: serverFetch });

  return html;
});`;
}

/**
 * Client-only renderer virtual module content.
 *
 * Used when SSR is disabled — simply serves the static index.html template
 * for every route, letting the client-side Angular router handle navigation.
 */
export function clientRenderer() {
  return `
import { defineHandler } from 'nitro/h3';
import template from '#analog/index';

export default defineHandler(async (event) => {
  event.res.headers.set('content-type', 'text/html; charset=utf-8');
  return template;
});
`;
}

/**
 * API middleware virtual module content.
 *
 * Intercepts requests matching the configured API prefix and either:
 * - Uses event-bound internal forwarding for GET requests (except .xml routes)
 * - Uses request proxying for all other methods to forward the full request
 *
 * h3 v2 idiomatic APIs used:
 * - defineHandler (replaces defineEventHandler / eventHandler)
 * - event.path (replaces event.node.req.url)
 * - event.method (replaces event.node.req.method)
 * - proxyRequest is retained internally because it preserves Nitro route
 *   matching for event-bound server requests during SSR/prerender
 * - Object.fromEntries(event.req.headers.entries()) replaces direct event.node.req.headers access
 *
 * `fetchWithEvent` keeps the active event context while forwarding to a
 * rewritten path, which avoids falling through to the HTML renderer when
 * SSR code makes relative API requests.
 */
export const apiMiddleware = `
import { defineHandler, fetchWithEvent, proxyRequest } from 'nitro/h3';
import { useRuntimeConfig } from 'nitro/runtime-config';

export default defineHandler(async (event) => {
  const prefix = useRuntimeConfig().prefix;
  const apiPrefix = \`\${prefix}/\${useRuntimeConfig().apiPrefix}\`;

  if (event.path?.startsWith(apiPrefix)) {
    const reqUrl = event.path?.replace(apiPrefix, '');

    if (
      event.method === 'GET' &&
      // in the case of XML routes, we want to proxy the request so that nitro gets the correct headers
      // and can render the XML correctly as a static asset
      !event.path?.endsWith('.xml')
    ) {
      return fetchWithEvent(event, reqUrl, {
        headers: Object.fromEntries(event.req.headers.entries()),
      });
    }

    return proxyRequest(event, reqUrl);
  }
});`;
