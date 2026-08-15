import { eventHandler, sendRedirect, setHeaders } from 'h3';

export default eventHandler((event) => {
  event.context['analogTest'] = 'from-middleware';

  if (event.node.req.url?.startsWith('/checkout')) {
    setHeaders(event, { 'x-analog-test': 'true' });
    return sendRedirect(event, '/');
  }

  return undefined;
});
