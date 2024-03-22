import { eventHandler } from 'h3';

// @ts-ignore
import renderer from '#analog/ssr';
// @ts-ignore
import template from '#analog/index';

export default eventHandler(async (event) => {
  const html = await renderer(event.node.req.url, template, {
    req: event.node.req,
    res: event.node.res,
  });
  return html;
});
