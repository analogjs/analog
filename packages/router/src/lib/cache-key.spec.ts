import { HttpParams, HttpRequest } from '@angular/common/http';

import { makeCacheKey } from './cache-key';

describe('makeCacheKey', () => {
  it('is deterministic for the same request', () => {
    const req = new HttpRequest('GET', '/api/todos');

    expect(makeCacheKey(req, '/api/todos')).toEqual(
      makeCacheKey(req, '/api/todos'),
    );
  });

  it('produces distinct keys for distinct requests', () => {
    const a = makeCacheKey(new HttpRequest('GET', '/api/a'), '/api/a');
    const b = makeCacheKey(new HttpRequest('GET', '/api/b'), '/api/b');

    expect(a).not.toEqual(b);
  });

  it('does not collide on inputs that broke the previous 32-bit hash', () => {
    // "Aa" and "BB" collide under DJB2; the mapped URL flows into the key.
    const a = makeCacheKey(new HttpRequest('GET', '/Aa'), '/Aa');
    const b = makeCacheKey(new HttpRequest('GET', '/BB'), '/BB');

    expect(a).not.toEqual(b);
  });

  it('keys on method, params, and body', () => {
    const base = makeCacheKey(new HttpRequest('GET', '/api'), '/api');
    const withParams = makeCacheKey(
      new HttpRequest('GET', '/api', {
        params: new HttpParams({ fromString: 'q=1' }),
      }),
      '/api',
    );
    const post = makeCacheKey(
      new HttpRequest('POST', '/api', { a: 1 }),
      '/api',
    );

    expect(base).not.toEqual(withParams);
    expect(base).not.toEqual(post);
  });
});
