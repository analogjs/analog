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
    // Digests of the composed key string `GET|json|<url>||`, from an independent
    // SHA-256, covering utf-8 encoding and more than one 64-byte padding block.
    const unicode = makeCacheKey(
      new HttpRequest('GET', '/api/tôdôs'),
      '/api/tôdôs',
    );
    expect(unicode).toEqual(
      'ba4bec59cdb7ceb3b8228e3c71e0aa49f6c6812c4a792ad963da1dbf0263e4b0',
    );

    const longUrl = `/api/${'a'.repeat(100)}`;
    const long = makeCacheKey(new HttpRequest('GET', longUrl), longUrl);
    expect(long).toEqual(
      '640396e812e78b5c8e1de7cf5fc2e2b6237aad36e3fca5fb26b7812a68d408fe',
    );
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
