import { HttpParams, HttpRequest, HttpResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { lastValueFrom, of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { API_PREFIX, BASE_URL } from '../../tokens/src';

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
});
