/**
 * This file is written in JavaScript
 * because it is used by Nitro to build
 * the renderer for SSR.
 *
 * The package is shipped as commonjs
 * which won't be parsed by Nitro correctly.
 */
import { eventHandler } from 'h3';
import { useStorage } from '#imports';

export default eventHandler(async (event) => {
  const render = (await import('#build/../ssr/main.server.mjs'))['default'];
  const template = await useStorage().getItem(`/assets/public:index.html`);

  const html = await render(event.req.url, template);

  return html;
});
