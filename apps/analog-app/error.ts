export default async function errorHandler(error, event) {
  event.res.headers.set('content-type', 'text/plain; charset=utf-8');
  return 'error' + error.toString();
}
