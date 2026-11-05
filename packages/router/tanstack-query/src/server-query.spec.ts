import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { serverMutationOptions } from './server-query';

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
