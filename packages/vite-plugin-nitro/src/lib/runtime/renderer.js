/**
 * This file is written in JavaScript
 * because it is used by Nitro to build
 * the renderer for SSR.
 *
 * The package is shipped as commonjs
 * which won't be parsed by Nitro correctly.
 */
import { eventHandler } from 'h3';

import renderer from '#analog/ssr';
import template from '#analog/index';

export default eventHandler(async (event) => {
  const html = await renderer(event.node.req.url, template);

  return html;
});
