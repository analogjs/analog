import { makeStateKey, TransferState } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createServerFnRef } from './server-fn-ref';
import { SERVER_FN_DISPATCHER } from './dispatcher';
import { injectServerFn, injectServerFnMutation } from './inject-server-fn';
import type { ServerFn } from './types';

// Refs as the build transform emits them: id only, no handler.
const getProducts = createServerFnRef<void, string[]>({ id: 'abc123' });
const getProduct = createServerFnRef<{ id: string }, { name: string }>({
  id: 'def456',
  input: {},
});

function setup(providers: unknown[] = []) {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      ...(providers as []),
    ],
  });
}

describe('injectServerFn', () => {
  beforeEach(() => TestBed.resetTestingModule());

  it('reads through HttpClient and exposes the value on the resource', async () => {
    setup();
    const products = TestBed.runInInjectionContext(() =>
      injectServerFn(getProducts),
    );
    const http = TestBed.inject(HttpTestingController);

    TestBed.tick();
    const request = await vi.waitFor(() =>
      http.expectOne('/_analog/fn/abc123'),
    );
    expect(request.request.method).toBe('GET');
    request.flush(['keyboard']);

    await vi.waitFor(() => expect(products.value()).toEqual(['keyboard']));
    http.verify();
  });

  it('stays idle while the args factory returns undefined', () => {
    setup();
    TestBed.runInInjectionContext(() =>
      injectServerFn(getProduct, () => undefined),
    );
    TestBed.tick();

    // No request: an unresolved input leaves the resource idle rather than
    // calling the server with a partial argument.
    TestBed.inject(HttpTestingController).verify();
  });

  it('hydrates from the TransferState seed without a request', async () => {
    setup();
    TestBed.inject(TransferState).set(
      makeStateKey<string[]>('__analog_fn_abc123__'),
      ['seeded'],
    );

    const products = TestBed.runInInjectionContext(() =>
      injectServerFn(getProducts),
    );
    TestBed.tick();

    await vi.waitFor(() => expect(products.value()).toEqual(['seeded']));
    TestBed.inject(HttpTestingController).verify();
  });

  it('posts input for a mutation and resolves the result', async () => {
    setup();
    const call = TestBed.runInInjectionContext(() =>
      injectServerFnMutation(getProduct),
    );

    const pending = call({ id: 'p1' });
    const request = TestBed.inject(HttpTestingController).expectOne(
      '/_analog/fn/def456',
    );
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ id: 'p1' });
    request.flush({ name: 'keyboard' });

    await expect(pending).resolves.toEqual({ name: 'keyboard' });
  });

  it('dispatches in-process instead of over HTTP during SSR', async () => {
    const calls: unknown[] = [];
    setup([
      {
        provide: SERVER_FN_DISPATCHER,
        useValue: async (fn: ServerFn<unknown, unknown>, input: unknown) => {
          calls.push([fn.id, input]);
          return { name: 'in-process' };
        },
      },
    ]);

    const call = TestBed.runInInjectionContext(() =>
      injectServerFnMutation(getProduct),
    );

    await expect(call({ id: 'p1' })).resolves.toEqual({ name: 'in-process' });
    expect(calls).toEqual([['def456', { id: 'p1' }]]);
    TestBed.inject(HttpTestingController).verify();
  });
});
