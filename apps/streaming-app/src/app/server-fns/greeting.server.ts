import { serverFn } from '@analogjs/router/server';

// GET (input-less) server function. The `token` is minted per server call, so
// it is a witness for how the value was resolved on the client: if the client
// hydrates from the SSR TransferState seed it renders the SAME token that was
// serialized; if the client refetches over HTTP it renders a DIFFERENT token.
export const getGreeting = serverFn(
  async (): Promise<{ message: string; token: string }> => {
    return {
      message: 'hello from serverFn',
      token: `srv-${globalThis.crypto.randomUUID()}`,
    };
  },
);
