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

  it('produces SHA-256 digests, including for unicode and multi-block input', () => {
    // Digests of the length-delimited composed key, from an independent SHA-256,
    // covering utf-8 encoding and more than one 64-byte padding block.
    const unicode = makeCacheKey(
      new HttpRequest('GET', '/api/tôdôs'),
      '/api/tôdôs',
    );
    expect(unicode).toEqual(
      'dee8a1da8cecc1aa25d6a788bb81edf94ca3872452a04601dcef5c916f6c0b61',
    );

    const longUrl = `/api/${'a'.repeat(100)}`;
    const long = makeCacheKey(new HttpRequest('GET', longUrl), longUrl);
    expect(long).toEqual(
      '2b6caca02694b21b4395374edf234f16b85abdf66845060d4fdb4f367125d682',
    );
  });

  it('does not collide on ambiguous parameter serialization', () => {
    // `?tag=x&tag=y` and `?tag=x,y` both stringify to `tag=x,y` under the old
    // serialization, so distinct requests shared a cache slot.
    const repeated = makeCacheKey(
      new HttpRequest('GET', '/api', {
        params: new HttpParams({ fromString: 'tag=x&tag=y' }),
      }),
      '/api',
    );
    const comma = makeCacheKey(
      new HttpRequest('GET', '/api', {
        params: new HttpParams({ fromString: 'tag=x,y' }),
      }),
      '/api',
    );

    expect(repeated).not.toEqual(comma);
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
