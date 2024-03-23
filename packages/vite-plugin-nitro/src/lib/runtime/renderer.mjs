/**
 * This file is shipped as ESM for Windows support,
 * as it won't resolve the renderer.ts file correctly in node.
 */
import { eventHandler } from 'h3';
// @ts-ignore
// import { eventHandler } from 'h3';

// Nitro aliases for the SSR renderer and client index.html template
// @ts-ignore
import render from '#analog/ssr';
// @ts-ignore
import template from '#analog/index';

export default eventHandler(async (event) => {
  const html = await render(event.node.req.url, template, {
    req: event.node.req,
    res: event.node.res,
  });
  return html;
});
