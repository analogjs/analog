import type { IncomingMessage } from 'node:http';
import { describe, expect, it } from 'vitest';

import { toWebRequest } from './node-web-bridge';

describe('toWebRequest', () => {
  it('ignores HTTP/2 pseudo-headers when building web headers', () => {
    const req = {
      headers: {
        ':authority': 'example.com',
        ':method': 'GET',
        ':path': '/blog',
        accept: 'text/html',
        host: 'example.com',
        'x-forwarded-proto': 'https',
      },
      method: 'GET',
      url: '/blog',
    } as IncomingMessage;

    const request = toWebRequest(req);
    const headerKeys = Array.from(request.headers.keys());

    expect(request.url).toBe('http://example.com/blog');
    expect(request.headers.get('accept')).toBe('text/html');
    expect(request.headers.get('host')).toBe('example.com');
    expect(headerKeys).not.toContain(':authority');
    expect(headerKeys).not.toContain(':method');
    expect(headerKeys).not.toContain(':path');
  });
});
