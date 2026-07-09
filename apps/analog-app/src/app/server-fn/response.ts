// Mirrors `@analogjs/router/server/actions` (`fail` / `json` / `redirect`).
// Local copies keep the prototype self-contained; the promoted version reuses
// the router package helpers verbatim.

export function fail<T = object>(status: number, errors: T): Response {
  return new Response(JSON.stringify(errors), {
    status,
    headers: { 'Content-Type': 'application/json', 'X-Analog-Errors': 'true' },
  });
}

export function json<T = object>(data: T, init?: ResponseInit): Response {
  return new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    ...init,
  });
}

export function redirect(url: string, status = 302): Response {
  return new Response(null, { status, headers: { Location: url } });
}
