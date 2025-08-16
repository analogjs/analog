import { eventHandler, redirect, setHeaders } from 'h3';

export default eventHandler((event) => {
  if (event.req.url === '/checkout') {
    console.log('event url', event.req.url);

    setHeaders(event, {
      'x-analog-test': 'true',
    });

    return redirect(event, '/cart');
  }

  // Return undefined for other paths
  return undefined;
});
