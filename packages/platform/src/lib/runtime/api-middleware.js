/**
 * This file is written in JavaScript
 * because it is used by Nitro to build
 * the renderer for SSR.
 *
 * The package is shipped as commonjs
 * which won't be parsed by Nitro correctly.
 */
import { eventHandler } from 'h3';

export default eventHandler(async (event) => {
  if (event.req.url?.startsWith('/api')) {
    return $fetch(`${event.req.url?.replace('/api', '')}`);
  }
});
