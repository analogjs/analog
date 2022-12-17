export default async function errorHandler(error, event) {
  event.res.end('error' + error.toString());
}
