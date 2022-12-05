import { eventHandler } from 'h3';

export default eventHandler(async (event) => {
  if (event.req.url?.startsWith('/api')) {
    return $fetch(`${event.req.url?.replace('/api', '')}`);
  }
});
