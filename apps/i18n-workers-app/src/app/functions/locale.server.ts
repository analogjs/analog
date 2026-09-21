import { serverFn } from '@analogjs/router/server';
import { injectRequest } from '@analogjs/router/tokens';

export const translatedMessage = serverFn(async () => {
  const req = injectRequest();
  await new Promise((resolve) => setTimeout(resolve, 40));
  return {
    message: $localize`:@@code:Espanol code`,
    requestId: req?.headers['x-request-id'],
  };
});
