import { eventHandler, sendRedirect, setHeaders } from 'nitro/h3';

export default eventHandler((event) => {
  const pathname = new URL(event.req.url).pathname;

  if (pathname === '/checkout') {
    setHeaders(event, {
      'x-analog-test': 'true',
    });

    return sendRedirect(event, '/cart', 302);
  }

  return;
});
