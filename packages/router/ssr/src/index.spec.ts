import { REQUEST as ANGULAR_REQUEST, RESPONSE_INIT } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BASE_URL, REQUEST, RESPONSE } from '@analogjs/router/tokens';

import { provideServerRequestContext } from './index';

describe('provideServerRequestContext', () => {
  it('bridges the Angular request and response init into Analog tokens', () => {
    const responseInit: ResponseInit = {};

    TestBed.configureTestingModule({
      providers: [
        provideServerRequestContext(),
        {
          provide: ANGULAR_REQUEST,
          useValue: new Request('http://example.com/products/1?ref=home', {
            headers: { cookie: 'session=abc' },
          }),
        },
        { provide: RESPONSE_INIT, useValue: responseInit },
      ],
    });

    const request = TestBed.inject(REQUEST);
    expect(request.originalUrl).toBe('/products/1?ref=home');
    expect(request.url).toBe('/products/1?ref=home');
    expect(request.method).toBe('GET');
    expect(request.headers.cookie).toBe('session=abc');

    expect(TestBed.inject(BASE_URL)).toBe('http://example.com');

    const response = TestBed.inject(RESPONSE);
    response.statusCode = 404;
    response.setHeader('x-robots-tag', 'noindex');
    expect(response.statusCode).toBe(404);
    expect(responseInit.status).toBe(404);
    expect((responseInit.headers as Headers).get('x-robots-tag')).toBe(
      'noindex',
    );
    expect(response.getHeader('x-robots-tag')).toBe('noindex');
  });

  it('resolves the tokens to null outside of a server request', () => {
    TestBed.configureTestingModule({
      providers: [provideServerRequestContext()],
    });

    expect(TestBed.inject(REQUEST)).toBeNull();
    expect(TestBed.inject(RESPONSE)).toBeNull();
    expect(TestBed.inject(BASE_URL)).toBeNull();
  });
});
