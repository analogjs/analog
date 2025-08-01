import { eventHandler, getResponseHeader } from 'h3';
// @ts-ignore
import renderer from '#analog/ssr';
// @ts-ignore
import template from '#analog/index';

export default eventHandler(async (event) => {
  // Try to get the noSSR header, but handle cases where event structure might be different
  let noSSR;
  try {
    noSSR = getResponseHeader(event, 'x-analog-no-ssr');
  } catch (error) {
    // If getResponseHeader fails, assume no SSR is not set
    noSSR = undefined;
  }

  if (noSSR === 'true') {
    return template;
  }

  const html = await renderer(event.req.url, template, {
    req: event.req,
    res: event._res,
  });

  return html;
});
