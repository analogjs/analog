import { HttpParams, HttpRequest } from '@angular/common/http';
import { StateKey, makeStateKey } from '@angular/core';

function sortAndConcatParams(params: HttpParams | URLSearchParams): string {
  return [...params.keys()]
    .sort()
    .map((k) => `${k}=${params.getAll(k)}`)
    .join('&');
}

export function makeCacheKey(
  request: HttpRequest<any>,
  mappedRequestUrl: string,
): StateKey<unknown> {
  // make the params encoded same as a url so it's easy to identify
  const { params, method, responseType } = request;
  const encodedParams = sortAndConcatParams(params);

  let serializedBody = request.serializeBody();
  if (serializedBody instanceof URLSearchParams) {
    serializedBody = sortAndConcatParams(serializedBody);
  } else if (typeof serializedBody !== 'string') {
    serializedBody = '';
  }

  const key = [
    method,
    responseType,
    mappedRequestUrl,
    serializedBody,
    encodedParams,
  ].join('|');

  const hash = generateHash(key);

  return makeStateKey(hash);
}

function generateHash(str: string) {
  let hash = 0;
  for (let i = 0, len = str.length; i < len; i++) {
    const chr = str.charCodeAt(i);
    hash = (hash << 5) - hash + chr;
    hash |= 0; // Convert to 32bit integer
  }
  return `${hash}`;
}
