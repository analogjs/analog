import { PLATFORM_ID, TransferState, makeStateKey } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import {
  ActivatedRouteSnapshot,
  Router,
  type RouterStateSnapshot,
} from '@angular/router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { API_PREFIX, BASE_URL, INTERNAL_FETCH } from '../../tokens/src';
import { ANALOG_META_KEY, ANALOG_PAGE_ENDPOINTS } from './endpoints';
import { toRouteConfig } from './route-config';

const endpointKey = '/src/app/pages/fixture.page.ts';
function setup(
  platform: 'server' | 'browser',
  fetch?: (...args: unknown[]) => Promise<unknown>,
  serialized = '{}',
) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: PLATFORM_ID, useValue: platform },
      { provide: API_PREFIX, useValue: 'api' },
      { provide: BASE_URL, useValue: 'http://localhost' },
      { provide: INTERNAL_FETCH, useValue: fetch },
      { provide: Router, useValue: { navigated: false } },
    ],
  });
  ANALOG_PAGE_ENDPOINTS[endpointKey] = async () => ({});
  const transfer = TestBed.inject(TransferState);
  for (const [key, value] of Object.entries(JSON.parse(serialized)))
    transfer.set(makeStateKey(key), value);
  return transfer;
}

function snapshot(scope = 'first'): ActivatedRouteSnapshot {
  const route = Object.assign(new ActivatedRouteSnapshot(), {
    queryParams: { scope },
    params: {},
    fragment: null,
    url: [],
    routeConfig: {
      [ANALOG_META_KEY]: { endpoint: '/pages/fixture', endpointKey },
    },
  });
  Object.defineProperty(route, 'parent', { value: null });
  return route;
}

function resolve(scope = 'first'): Promise<unknown> {
  const resolver = toRouteConfig(undefined).resolve?.['load'];
  if (typeof resolver !== 'function')
    throw new Error('Expected a page-load resolver');
  return TestBed.runInInjectionContext(() =>
    resolver(snapshot(scope), {} as RouterStateSnapshot),
  );
}

afterEach(() => {
  delete ANALOG_PAGE_ENDPOINTS[endpointKey];
  TestBed.resetTestingModule();
});

describe('page-load hydration', () => {
  it('shares one load across resolvers for the same navigation snapshot', async () => {
    const fetch = vi.fn(async () => ({ value: 'one load' }));
    setup('server', fetch);
    const route = snapshot();
    const resolver = toRouteConfig(undefined).resolve?.['load'];
    if (typeof resolver !== 'function')
      throw new Error('Expected a load resolver');
    const first = TestBed.runInInjectionContext(() =>
      resolver(route, {} as RouterStateSnapshot),
    );
    const second = TestBed.runInInjectionContext(() =>
      resolver(route, {} as RouterStateSnapshot),
    );
    expect(first).toBe(second);
    expect(await first).toEqual({ value: 'one load' });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it.each([null, false, 0, '', undefined, { message: 'server' }])(
    'reuses the serialized SSR value %j without a browser request',
    async (value) => {
      const fetch = vi.fn(async () => value);
      const server = setup('server', fetch);
      expect(await resolve()).toEqual(value);
      expect(fetch).toHaveBeenCalledOnce();
      const browser = setup('browser', undefined, server.toJson());
      await expect(resolve()).resolves.toEqual(value);
      TestBed.inject(HttpTestingController).expectNone(() => true);
      expect(browser.toJson()).toBe('{}');
    },
  );

  it('fetches fresh data after the transfer seed is consumed', async () => {
    const server = setup('server', async () => ({ value: 'seed' }));
    await resolve();
    setup('browser', undefined, server.toJson());
    expect(await resolve()).toEqual({ value: 'seed' });
    const pending = resolve();
    const request = TestBed.inject(HttpTestingController).expectOne(
      'http://localhost/api/_analog/pages/fixture?scope=first',
    );
    expect(request.request.transferCache).toBe(false);
    request.flush({ value: 'fresh' });
    expect(await pending).toEqual({ value: 'fresh' });
  });

  it('does not reuse a seed for a different query', async () => {
    const server = setup('server', async () => ({ value: 'first' }));
    await resolve('first');
    setup('browser', undefined, server.toJson());
    const pending = resolve('second');
    TestBed.inject(HttpTestingController)
      .expectOne('http://localhost/api/_analog/pages/fixture?scope=second')
      .flush({ value: 'second' });
    expect(await pending).toEqual({ value: 'second' });
    expect(await resolve('first')).toEqual({ value: 'first' });
  });

  it('does not seed a failed load', async () => {
    const failure = new Error('failed');
    const server = setup('server', async () => {
      throw failure;
    });
    await expect(resolve()).rejects.toBe(failure);
    expect(server.toJson()).toBe('{}');
  });

  it('does not reuse an unconsumed seed after initial navigation', async () => {
    const server = setup('server', async () => 'old');
    await resolve();
    const browser = setup('browser', undefined, server.toJson());
    TestBed.inject(Router).navigated = true;
    const pending = resolve();
    TestBed.inject(HttpTestingController)
      .expectOne('http://localhost/api/_analog/pages/fixture?scope=first')
      .flush('fresh');
    expect(await pending).toBe('fresh');
    expect(browser.toJson()).toBe('{}');
  });

  it('keeps query identities distinct even when their short string hashes collide', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce('Aa result')
      .mockResolvedValueOnce('BB result');
    const server = setup('server', fetch);
    await resolve('Aa');
    await resolve('BB');
    setup('browser', undefined, server.toJson());
    expect(await resolve('Aa')).toBe('Aa result');
    expect(await resolve('BB')).toBe('BB result');
    TestBed.inject(HttpTestingController).expectNone(() => true);
  });
});
