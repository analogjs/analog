import { eventHandler, sendRedirect, setHeaders } from 'h3';

export default eventHandler((event) => {
  if (event.node.req.originalUrl === '/checkout') {
    console.log('event url', event.node.req.originalUrl);

    setHeaders(event, {
      'x-analog-test': 'true',
    });

    sendRedirect(event, '/cart');
  }
});
