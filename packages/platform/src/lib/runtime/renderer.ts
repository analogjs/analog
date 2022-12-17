import { eventHandler } from 'h3';
// @ts-ignore
import { useStorage } from '#imports';

export default eventHandler(async (event) => {
  // @ts-ignore
  const render = (await import('#build/../ssr/main.server.mjs'))['default'];

  // @ts-ignore
  const template = await useStorage().getItem(`/assets/public:index.html`);

  const html = await render(event.req.url, template);

  return html;
});
