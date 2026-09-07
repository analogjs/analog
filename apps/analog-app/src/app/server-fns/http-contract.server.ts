import { inject } from '@angular/core';
import { serverFn } from '@analogjs/router/server';
import { REQUEST } from '@analogjs/router/tokens';
import { object, string, unknown } from 'valibot';
import { HTTP_LABEL } from './http-label';

// No page imports this module: Nitro must discover it before the first HTML request.
export const greeting = serverFn(() => ({ message: 'hello from cold HTTP' }));

export const echoJson = serverFn(unknown(), (input) => input);

export const echoContext = serverFn(object({ value: string() }), (input) => ({
  value: input.value,
  label: inject(HTTP_LABEL),
  requestMarker: inject(REQUEST).headers['x-request-marker'],
}));

export const redirect = serverFn(
  () =>
    new Response(null, {
      status: 303,
      headers: { location: '/render-policy/enabled' },
    }),
);

export const cookies = serverFn(() => {
  const headers = new Headers();
  headers.append('set-cookie', 'first=one; Path=/; HttpOnly');
  headers.append('set-cookie', 'second=two; Path=/; HttpOnly');
  return new Response(null, { status: 204, headers });
});

export const createdNull = serverFn(() => Response.json(null, { status: 201 }));
