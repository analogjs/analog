import { defineEventHandler, sendRedirect, setResponseHeader } from 'h3';

export default defineEventHandler((event) => {
  if (event.path === '/checkout') {
    setResponseHeader(event, 'x-analog-test', 'true');
    return sendRedirect(event, '/cart', 302);
  }

  return undefined;
});
