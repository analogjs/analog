import { eventHandler, getRouterParam, readBody } from 'h3';

import { dispatchServerFn } from '@analogjs/router/server';
import { serverFnAppProviders } from '../../../../app/server-fns';

/**
 * Prototype server-function transport endpoint: `/_analog/fn/:id`.
 * GET carries no input; POST carries a JSON body. A real implementation
 * generates one handler per function from the build transform.
 */
export default eventHandler(async (event) => {
  const id = getRouterParam(event, 'id') as string;
  const input = event.method === 'GET' ? undefined : await readBody(event);

  const { status, body } = await dispatchServerFn(
    id,
    input,
    event,
    serverFnAppProviders,
  );

  event.node.res.statusCode = status;
  return body;
});
