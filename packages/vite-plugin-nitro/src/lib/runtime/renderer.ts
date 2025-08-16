/* eslint-disable @nx/enforce-module-boundaries */
import { eventHandler } from 'h3';
import renderer from '#analog/ssr';
import template from '#analog/index';

export default eventHandler(async (event) => {
  // Try to get the noSSR header, but handle cases where event structure might be different
  let noSSR;
  try {
    noSSR = event.res.headers.get('x-analog-no-ssr');
  } catch (error) {
    // If event.res.headers.get fails, assume no SSR is not set
    noSSR = undefined;
  }

  if (noSSR === 'true') {
    return template;
  }

  try {
    const html = await renderer(event.req.url, template, {
      req: event.req,
      res: event._res,
    });

    // Ensure we return a string, not a Promise
    if (typeof html === 'string') {
      return html;
    } else if (html instanceof Promise) {
      return await html;
    } else {
      return String(html);
    }
  } catch (error) {
    console.error('Renderer error:', error);
    return template;
  }
});
