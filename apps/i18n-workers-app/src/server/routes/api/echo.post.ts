import {
  defineEventHandler,
  readRawBody,
  setResponseHeader,
  setResponseStatus,
} from 'h3';
export default defineEventHandler(async (event) => {
  setResponseStatus(event, 201);
  setResponseHeader(event, 'set-cookie', ['first=1', 'second=2']);
  return {
    body: await readRawBody(event),
    host: event.node.req.headers.host,
    locale: process.env['ANALOG_I18N_LOCALE'],
  };
});
