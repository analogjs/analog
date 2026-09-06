import { inject } from '@angular/core';
import { serverFn } from '@analogjs/router/server';
import { REQUEST } from '@analogjs/router/tokens';
import { object, string } from 'valibot';
import { SERVER_LABEL } from '../server-label';

// Deliberately not imported by a page: the HTTP registry must load this module
// on a cold request rather than relying on prior SSR registration side effects.
export const echo = serverFn(object({ value: string() }), (input) => ({
  value: input.value,
  label: inject(SERVER_LABEL),
  requestMarker: inject(REQUEST).headers['x-request-marker'],
}));

export const redirect = serverFn(
  () => new Response(null, { status: 303, headers: { location: '/buffered' } }),
);

export const cookies = serverFn(() => {
  const headers = new Headers();
  headers.append('set-cookie', 'first=one; Path=/; HttpOnly');
  headers.append('set-cookie', 'second=two; Path=/; HttpOnly');
  return new Response(null, { status: 204, headers });
});
