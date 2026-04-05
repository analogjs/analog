import { defineHandler, redirect } from 'nitro/h3';

export default defineHandler((event) => {
  if (event.path === '/checkout') {
    event.res.headers.set('x-analog-test', 'true');
    return redirect('/cart', 302);
  }

  return undefined;
});
