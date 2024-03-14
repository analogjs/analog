/**
 * This file is written in JavaScript
 * because it is used by Nitro to build
 * the renderer for SSR.
 *
 * The package is shipped as commonjs
 * which won't be parsed by Nitro correctly.
 */
import { eventHandler } from 'h3';
/**
 * This file is written in JavaScript
 * because it is used by Nitro to build
 * the renderer for SSR.
 *
 * The package is shipped as commonjs
 * which won't be parsed by Nitro correctly.
 */
// @ts-ignore
// import { eventHandler } from 'h3';

// Nitro aliases for the SSR renderer and client index.html template
// @ts-ignore
import render from '#analog/ssr';
// @ts-ignore
import template from '#analog/index';

export default eventHandler(async (event) => {
  const html = await render(event.req.url, template);

  return html;
});
