import type { H3Event, H3EventContext } from 'h3';
import type { $Fetch } from 'nitropack';

export type PageServerAction = {
  params: H3EventContext['params'];
  req: H3Event['node']['req'];
  res: H3Event['node']['res'];
  fetch: $Fetch;
  event: H3Event;
};

export function fail<T = object>(status: number, errors: T) {
  return new Response(JSON.stringify(errors), {
    status,
    headers: {
      'X-Analog-Errors': 'true',
    },
  });
}

export function json<T = object>(data: T, config?: ResponseInit) {
  return new Response(JSON.stringify(data), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
    ...config,
  });
}

export function redirect(url: string, config: number | ResponseInit = 302) {
  if (typeof config === 'number') {
    return new Response(null, {
      status: config,
      headers: {
        Location: `${url}`,
      },
    });
  }

  return new Response(null, {
    headers: {
      Location: `${url}`,
    },
    ...config,
  });
}
