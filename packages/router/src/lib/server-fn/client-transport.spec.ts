import { createServerFnRef } from './server-fn-ref';
import { injectServerFnMutation, ServerFnClient } from './inject-server-fn';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const read = createServerFnRef<void, string>({ id: 'qualification-read' });
const lookup = createServerFnRef<unknown, string>({
  id: 'qualification-lookup',
  method: 'POST',
});

beforeEach(() => {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(
        withInterceptors([
          (request, next) =>
            next(
              request.clone({ setHeaders: { 'x-qualification': 'client' } }),
            ),
        ]),
      ),
      provideHttpClientTesting(),
    ],
  });
});

afterEach(() => TestBed.inject(HttpTestingController).verify());

describe('server-function HTTP input encoding', () => {
  it('uses GET for input-less reads and preserves Angular interceptors', async () => {
    const pending = TestBed.inject(ServerFnClient).call(read, undefined);
    const request = TestBed.inject(HttpTestingController).expectOne(read.url);
    expect(request.request.method).toBe('GET');
    expect(request.request.headers.get('x-qualification')).toBe('client');
    request.flush('read-result');
    await expect(pending).resolves.toBe('read-result');
  });

  it.each(
    [null, false, 0, '', 'text', { page: 'services' }, ['services']].map(
      (input) => ({ input }),
    ),
  )('preserves JSON POST input $input', async ({ input }) => {
    const submit = TestBed.runInInjectionContext(() =>
      injectServerFnMutation(lookup),
    );
    const pending = submit(input);
    const request = TestBed.inject(HttpTestingController).expectOne(lookup.url);
    expect(request.request.method).toBe('POST');
    expect(request.request.serializeBody()).toBe(JSON.stringify(input));
    expect(
      request.request.headers.get('Content-Type') ??
        request.request.detectContentTypeHeader(),
    ).toBe('application/json');
    request.flush('written');
    await expect(pending).resolves.toBe('written');
  });

  it('rejects failed mutations without replaying the write', async () => {
    const pending = TestBed.inject(ServerFnClient).call(lookup, {
      page: 'services',
    });
    const failure = pending.catch((reason: unknown) => reason);
    TestBed.inject(HttpTestingController)
      .expectOne(lookup.url)
      .flush('unknown outcome', { status: 502, statusText: 'Bad Gateway' });
    expect(await failure).toMatchObject({ status: 502 });
    TestBed.inject(HttpTestingController).expectNone(lookup.url);
  });
});
