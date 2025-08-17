import { eventHandler, sendRedirect, setHeaders } from 'h3';

// This is a ROUTE HANDLER (not middleware) because it returns a response
export default eventHandler((event) => {
  console.log('Checkout route accessed, redirecting to cart');

  setHeaders(event, {
    'x-analog-test': 'true',
  });

  // sendRedirect() returns a response, making this an event handler
  return sendRedirect(event, '/cart');
});
