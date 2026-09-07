import type { HttpClient } from '@angular/common/http';
import { ServerFnClient } from '@analogjs/router';
import { serverFn } from '@analogjs/router/server';
import {
  definePageLoad,
  defineServerRoute,
} from '@analogjs/router/server/actions';
import {
  serverMutationOptions,
  serverQueryOptions,
} from '@analogjs/router/tanstack-query';
import { object, string } from 'valibot';

declare module '@analogjs/router' {
  interface ServerFnContext {
    user: { id: string };
  }
}

const contextual = serverFn((_input, context) => {
  context.user.id satisfies string;
  // @ts-expect-error Server function context augmentation retains field types.
  context.user.id satisfies number;
  return context.user.id;
});

declare const http: HttpClient;
declare const client: ServerFnClient;
client.call(contextual, undefined) satisfies Promise<string>;

const echo = serverFn(object({ name: string() }), (input) => ({
  message: input.name,
}));
client.call(echo, { name: 'reader' }) satisfies Promise<{ message: string }>;
client.call(
  echo,
  { name: 'reader' },
  new AbortController().signal,
) satisfies Promise<{ message: string }>;
// @ts-expect-error Server function input retains its schema type.
client.call(echo, { name: 42 });
// @ts-expect-error Server function result is an object, not a number.
client.call(echo, { name: 'reader' }) satisfies Promise<number>;
// @ts-expect-error The optional cancellation parameter must be an AbortSignal.
client.call(echo, { name: 'reader' }, 'cancel');

const route = defineServerRoute({
  query: object({ term: string() }),
  body: object({ title: string() }),
  handler({ query, body, event }) {
    query.term satisfies string;
    body.title satisfies string;
    event.method satisfies string;
    // @ts-expect-error Query context is inferred from its schema.
    query.term satisfies number;
    // @ts-expect-error Unknown body fields are rejected in the handler.
    body.missing;
    return { message: query.term + body.title };
  },
});

serverQueryOptions<typeof route, Error, string>(http, '/api/search', {
  queryKey: ['search'],
  query: { term: 'reader' },
  select: (result) => result.message.toUpperCase(),
});
serverQueryOptions<typeof route>(http, '/api/search', {
  queryKey: ['search'],
  // @ts-expect-error Query input retains its schema type.
  query: { term: 42 },
});
serverMutationOptions<typeof route>(http, '/api/search', {
  onMutate: (body) => {
    body.title satisfies string;
    // @ts-expect-error Mutation body retains its schema type.
    body.title satisfies number;
  },
  onSuccess: (result) => {
    result.message satisfies string;
  },
});

definePageLoad({
  params: object({ id: string() }),
  query: object({ view: string() }),
  handler({ params, query, req, res, event }) {
    params.id satisfies string;
    query.view satisfies string;
    req.headers satisfies object;
    res.statusCode = 200;
    event.method satisfies string;
    // @ts-expect-error Page parameters retain their schema type.
    params.id satisfies number;
    // @ts-expect-error Unknown query fields are rejected in page loads.
    query.missing;
    return { id: params.id, view: query.view };
  },
});
