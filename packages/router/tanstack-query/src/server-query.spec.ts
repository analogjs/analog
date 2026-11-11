import { TransferState } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  HttpClient,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { QueryClient } from '@tanstack/angular-query-experimental';
import { $fetch } from 'ofetch';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  serverInfiniteQueryOptions,
  serverMutationOptions,
  serverQueryOptions,
} from './server-query';
import { requestContextInterceptor } from '../../src/lib/request-context';
import { API_PREFIX, BASE_URL, INTERNAL_FETCH } from '../../tokens/src';

function setup() {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting()],
  });
  return {
    http: TestBed.inject(HttpClient),
    controller: TestBed.inject(HttpTestingController),
  };
}

describe('serverMutationOptions', () => {
  beforeEach(() => TestBed.resetTestingModule());

  it.each([
    ['string', 'hello'],
    ['object', { title: 'analog' }],
  ])('sends a %s body as JSON', async (_, body) => {
    const { http, controller } = setup();
    const { mutationFn } = serverMutationOptions<any>(http, '/api/todos');

    const result = mutationFn!(body, {} as any);
    const request = controller.expectOne('/api/todos');
    expect(request.request.headers.get('content-type')).toBe(
      'application/json',
    );
    expect(JSON.parse(request.request.body)).toEqual(body);
    request.flush({ ok: true });

    await expect(result).resolves.toEqual({ ok: true });
  });
});

describe('server query cancellation', () => {
  beforeEach(() => TestBed.resetTestingModule());

  it('cancels the request when the query is cancelled', async () => {
    const { http, controller } = setup();
    const client = new QueryClient();

    void client
      .fetchQuery(
        serverQueryOptions<any>(http, '/api/todos', { queryKey: ['todos'] }),
      )
      .catch(() => undefined);
    const request = await vi.waitFor(() => controller.expectOne('/api/todos'));
    await client.cancelQueries();

    expect(request.cancelled).toBe(true);
  });

  it('cancels the request when the infinite query is cancelled', async () => {
    const { http, controller } = setup();
    const client = new QueryClient();

    void client
      .fetchInfiniteQuery(
        serverInfiniteQueryOptions<any>(http, '/api/todos', {
          queryKey: ['todos'],
          query: ({ pageParam }) => ({ page: pageParam }),
          initialPageParam: 1,
          getNextPageParam: () => undefined,
        }) as any,
      )
      .catch(() => undefined);
    const request = await vi.waitFor(() =>
      controller.expectOne('/api/todos?page=1'),
    );
    await client.cancelQueries();

    expect(request.cancelled).toBe(true);
  });
});

describe('server query transfer cache', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([requestContextInterceptor])),
        { provide: API_PREFIX, useValue: 'api' },
        { provide: BASE_URL, useValue: 'http://localhost:3000' },
        {
          provide: INTERNAL_FETCH,
          useValue: $fetch.create(
            {},
            { fetch: async () => Response.json({ ok: true }) },
          ),
        },
      ],
    });
  });

  it('does not store server query responses in TransferState', async () => {
    const http = TestBed.inject(HttpClient);
    const client = new QueryClient();

    await client.fetchQuery(
      serverQueryOptions<any>(http, '/api/todos', { queryKey: ['todos'] }),
    );
    await client.fetchInfiniteQuery(
      serverInfiniteQueryOptions<any>(http, '/api/todos', {
        queryKey: ['todos', 'infinite'],
        query: ({ pageParam }) => ({ page: pageParam }),
        initialPageParam: 1,
        getNextPageParam: () => undefined,
      }) as any,
    );
    await serverMutationOptions<any>(http, '/api/todos').mutationFn!(
      { title: 'analog' },
      {} as any,
    );

    expect(TestBed.inject(TransferState).isEmpty).toBe(true);
  });
});
