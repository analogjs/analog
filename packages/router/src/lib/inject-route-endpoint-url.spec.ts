import { TestBed } from '@angular/core/testing';
import type { ActivatedRouteSnapshot, Params } from '@angular/router';
import { describe, expect, it } from 'vitest';

import { API_PREFIX, BASE_URL } from '../../tokens/src';
import { ANALOG_META_KEY } from './endpoints';
import { injectRouteEndpointURL } from './inject-route-endpoint-url';

function endpointURL(queryParams: Params): URL {
  TestBed.configureTestingModule({
    providers: [
      { provide: API_PREFIX, useValue: 'api' },
      { provide: BASE_URL, useValue: 'http://localhost:3000' },
    ],
  });

  const route = {
    routeConfig: {
      [ANALOG_META_KEY]: { endpoint: '/search', endpointKey: '/search' },
    },
    queryParams,
    fragment: null,
    params: {},
    parent: null,
  } as unknown as ActivatedRouteSnapshot;

  return TestBed.runInInjectionContext(() => injectRouteEndpointURL(route));
}

describe('injectRouteEndpointURL', () => {
  it('keeps repeated query keys as separate params', () => {
    const url = endpointURL({ tag: ['a', 'b'] });

    expect(url.searchParams.getAll('tag')).toEqual(['a', 'b']);
  });

  it('serializes scalar query params', () => {
    const url = endpointURL({ q: 'x y', n: '1' });

    expect(url.search).toBe('?q=x+y&n=1');
  });
});
