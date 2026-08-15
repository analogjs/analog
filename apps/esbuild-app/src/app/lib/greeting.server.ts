import { serverFn } from '@analogjs/router/server';

export const getGreeting = serverFn(() => ({
  greeting: 'hello-from-server-fn',
}));

export const echoLength = serverFn(
  { method: 'POST' },
  (input: { text: string }) => ({ length: input.text.length }),
);
