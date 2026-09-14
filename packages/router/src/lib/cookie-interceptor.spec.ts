import {
  HttpHeaders,
  HttpRequest,
  HttpResponse,
  type HttpHandlerFn,
} from '@angular/common/http';
import { IncomingMessage } from 'node:http';
import { Socket } from 'node:net';
import { of } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cookieInterceptor } from './cookie-interceptor';

const sockets: Socket[] = [];
function parent() {
  const socket = new Socket();
  sockets.push(socket);
  const request = Object.assign(new IncomingMessage(socket), {
    originalUrl: '/page',
  });
  request.headers = {
    host: 'site.test',
    cookie: 'session=parent',
    'x-forwarded-proto': 'https',
  };
  return request;
}
afterEach(() => {
  for (const socket of sockets.splice(0)) socket.destroy();
});

describe('SSR cookie forwarding', () => {
  it.each([
    '/api/_analog/pages/data',
    'https://site.test/api/_analog/pages/data',
  ])('preserves explicit request headers for %s', (url) => {
    const request = new HttpRequest('GET', url, {
      headers: new HttpHeaders({
        authorization: 'Bearer explicit',
        'x-custom': 'kept',
      }),
    });
    const next = vi.fn<HttpHandlerFn>(() => of(new HttpResponse()));
    cookieInterceptor(request, next, 'server', parent());
    const forwarded = next.mock.calls[0]?.[0];
    expect(forwarded?.headers.get('authorization')).toBe('Bearer explicit');
    expect(forwarded?.headers.get('x-custom')).toBe('kept');
    expect(forwarded?.headers.get('cookie')).toBe('session=parent');
  });

  it.each([
    'https://other.test/api/_analog/pages/data',
    '//other.test/api/_analog/pages/data',
    '/\\other.test/api/_analog/pages/data',
    '/api/ordinary?next=/_analog/data',
  ])('does not add incoming cookies to %s', (url) => {
    const request = new HttpRequest('GET', url);
    const next = vi.fn<HttpHandlerFn>(() => of(new HttpResponse()));
    cookieInterceptor(request, next, 'server', parent());
    expect(next.mock.calls[0]?.[0]).toBe(request);
  });

  it('preserves an explicitly supplied cookie', () => {
    const request = new HttpRequest('GET', '/api/_analog/pages/data', {
      headers: new HttpHeaders({ cookie: 'explicit' }),
    });
    const next = vi.fn<HttpHandlerFn>(() => of(new HttpResponse()));
    cookieInterceptor(request, next, 'server', parent());
    expect(next.mock.calls[0]?.[0]?.headers.get('cookie')).toBe('explicit');
  });
});
