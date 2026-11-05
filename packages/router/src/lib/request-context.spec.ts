import {
  HttpErrorResponse,
  HttpParams,
  HttpRequest,
  HttpResponse,
} from '@angular/common/http';
import { TransferState } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { $fetch } from 'ofetch';
import { EMPTY, lastValueFrom, of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { API_PREFIX, BASE_URL, INTERNAL_FETCH } from '../../tokens/src';

import { requestContextInterceptor } from './request-context';

describe('requestContextInterceptor', () => {
  const originalFetch = (globalThis as typeof globalThis & { $fetch?: unknown })
    .$fetch;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: API_PREFIX, useValue: 'api' },
        { provide: BASE_URL, useValue: 'http://localhost:3000' },
      ],
    });
  });

  afterEach(() => {
    if (typeof originalFetch === 'undefined') {
      delete (globalThis as typeof globalThis & { $fetch?: unknown }).$fetch;
    } else {
      (globalThis as typeof globalThis & { $fetch?: unknown }).$fetch =
        originalFetch;
    }
  });

  it('forwards HttpRequest params during prerender requests', async () => {
    const raw = vi.fn().mockResolvedValue({
      _data: { ok: true },
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
    (
      globalThis as typeof globalThis & { $fetch?: { raw: typeof raw } }
    ).$fetch = {
      raw,
    };

    const request = new HttpRequest('GET', '/api/v1/todos', null, {
      params: new HttpParams({
        fromObject: {
          page: '2',
          filter: 'open',
        },
      }),
    });

    const response = await TestBed.runInInjectionContext(() =>
      lastValueFrom(
        requestContextInterceptor(request, () => of(null as never)),
      ),
    );

    expect(raw).toHaveBeenCalledWith(
      '/api/v1/todos',
      expect.objectContaining({
        params: {
          filter: 'open',
          page: '2',
        },
      }),
    );
    expect(response).toBeInstanceOf(HttpResponse);
  });

  it('lets HttpRequest params override duplicate query params from the url', async () => {
    const raw = vi.fn().mockResolvedValue({
      _data: { ok: true },
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
    (
      globalThis as typeof globalThis & { $fetch?: { raw: typeof raw } }
    ).$fetch = {
      raw,
    };

    const request = new HttpRequest('GET', '/api/v1/todos?page=1&tag=a', null, {
      params: new HttpParams({
        fromObject: {
          page: '3',
          tag: ['b', 'c'],
        },
      }),
    });

    await TestBed.runInInjectionContext(() =>
      lastValueFrom(
        requestContextInterceptor(request, () => of(null as never)),
      ),
    );

    expect(raw).toHaveBeenCalledWith(
      '/api/v1/todos',
      expect.objectContaining({
        params: {
          page: '3',
          tag: ['b', 'c'],
        },
      }),
    );
  });

  async function requestWithServerResponse(response: Response) {
    TestBed.overrideProvider(INTERNAL_FETCH, {
      useValue: $fetch.create({}, { fetch: async () => response }),
    });

    return TestBed.runInInjectionContext(() =>
      lastValueFrom(
        requestContextInterceptor(
          new HttpRequest('GET', '/api/v1/todos'),
          () => EMPTY,
        ),
      ),
    ).catch((error: unknown) => error);
  }

  it('rejects text error responses with an HttpErrorResponse', async () => {
    const error = await requestWithServerResponse(
      new Response('Not found', { status: 404 }),
    );

    expect(error).toBeInstanceOf(HttpErrorResponse);
    expect(error).toMatchObject({ status: 404, error: 'Not found' });
    expect(TestBed.inject(TransferState).isEmpty).toBe(true);
  });

  it('rejects JSON error responses with an HttpErrorResponse', async () => {
    const error = await requestWithServerResponse(
      Response.json({ message: 'Missing' }, { status: 404 }),
    );

    expect(error).toBeInstanceOf(HttpErrorResponse);
    expect(error).toMatchObject({ status: 404, error: { message: 'Missing' } });
  });
});
