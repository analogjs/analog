import { createServerFnRef } from './server-fn-ref';
import { SERVER_FN_DISPATCHER } from './dispatcher';
import {
  injectServerFn,
  injectServerFnMutation,
  ServerFnClient,
} from './inject-server-fn';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { ApplicationRef, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

describe('server-function client lifetime and encoding', () => {
  it('discards an in-process result after its caller is aborted', async () => {
    const result = Promise.withResolvers<string>();
    TestBed.overrideProvider(SERVER_FN_DISPATCHER, {
      useValue: () => result.promise,
    });
    const controller = new AbortController();
    const reason = new Error('obsolete SSR read');
    const pending = TestBed.inject(ServerFnClient).call(
      read,
      undefined,
      controller.signal,
    );
    const rejected = pending.catch((error: unknown) => error);
    controller.abort(reason);
    result.resolve('stale');
    expect(await rejected).toBe(reason);
    TestBed.inject(HttpTestingController).expectNone(read.url);
  });

  it('uses GET for input-less reads and preserves Angular interceptors', async () => {
    const pending = TestBed.inject(ServerFnClient).call(read, undefined);
    const request = TestBed.inject(HttpTestingController).expectOne(read.url);
    expect(request.request.method).toBe('GET');
    expect(request.request.headers.get('x-qualification')).toBe('client');
    request.flush('read-result');
    await expect(pending).resolves.toBe('read-result');
  });

  it.each(
    [null, false, 0, 'text', { page: 'services' }, ['services']].map(
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

  it('consumes the matching hydration seed once without an HTTP request', async () => {
    const client = TestBed.inject(ServerFnClient);
    client.writeSeed(lookup, { page: 'services' }, 'rendered');
    const resource = TestBed.runInInjectionContext(() =>
      injectServerFn(lookup, () => ({ page: 'services' })),
    );
    TestBed.tick();
    TestBed.inject(HttpTestingController).verify();
    await TestBed.inject(ApplicationRef).whenStable();
    expect(resource.value()).toBe('rendered');
    expect(client.readSeed(lookup, { page: 'services' })).toBeUndefined();
    resource.destroy();
  });

  it('keeps null input distinct from an input-less hydration entry', () => {
    const client = TestBed.inject(ServerFnClient);
    client.writeSeed(lookup, undefined, 'input-less');
    expect(client.readSeed(lookup, null)).toBeUndefined();
    expect(client.readSeed(lookup, undefined)).toBe('input-less');
  });

  it('cancels an obsolete resource request when inputs change', async () => {
    const input = signal({ page: 'first' });
    const resource = TestBed.runInInjectionContext(() =>
      injectServerFn(lookup, input),
    );
    TestBed.tick();
    const first = TestBed.inject(HttpTestingController).expectOne(lookup.url);
    input.set({ page: 'second' });
    TestBed.tick();
    const second = TestBed.inject(HttpTestingController).expectOne(lookup.url);
    expect(first.cancelled).toBe(true);
    second.flush('second-result');
    await TestBed.inject(ApplicationRef).whenStable();
    expect(resource.value()).toBe('second-result');
    resource.destroy();
  });

  it('cancels an in-flight request when its resource is destroyed', () => {
    const resource = TestBed.runInInjectionContext(() => injectServerFn(read));
    TestBed.tick();
    const request = TestBed.inject(HttpTestingController).expectOne(read.url);
    resource.destroy();
    expect(request.cancelled).toBe(true);
  });

  it('does not dispatch when the caller is already aborted', async () => {
    const controller = new AbortController();
    const reason = new Error('already aborted');
    controller.abort(reason);
    await expect(
      TestBed.inject(ServerFnClient).call(read, undefined, controller.signal),
    ).rejects.toBe(reason);
    TestBed.inject(HttpTestingController).expectNone(read.url);
  });

  it('propagates caller cancellation and removes its listener', async () => {
    const controller = new AbortController();
    const removed = vi.spyOn(controller.signal, 'removeEventListener');
    const pending = TestBed.inject(ServerFnClient).call(
      read,
      undefined,
      controller.signal,
    );
    const reason = new Error('caller cancelled');
    const rejected = pending.catch((error: unknown) => error);
    const request = TestBed.inject(HttpTestingController).expectOne(read.url);
    controller.abort(reason);
    expect(await rejected).toBe(reason);
    expect(request.cancelled).toBe(true);
    expect(removed).toHaveBeenCalledWith('abort', expect.any(Function));
  });

  it('removes the abort listener after successful completion', async () => {
    const controller = new AbortController();
    const removed = vi.spyOn(controller.signal, 'removeEventListener');
    const pending = TestBed.inject(ServerFnClient).call(
      read,
      undefined,
      controller.signal,
    );
    TestBed.inject(HttpTestingController).expectOne(read.url).flush('complete');
    await expect(pending).resolves.toBe('complete');
    expect(removed).toHaveBeenCalledWith('abort', expect.any(Function));
  });
});
