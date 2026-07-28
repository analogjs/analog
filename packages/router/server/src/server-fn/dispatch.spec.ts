import { Injectable, Injector, inject } from '@angular/core';
import { BASE_URL, LOCALE, REQUEST } from '@analogjs/router/tokens';
import { beforeEach, describe, expect, it } from 'vitest';

import { dispatchServerFn } from './dispatch';
import { serverFnRegistry } from './registry';
import { serverFn } from './server-fn';
import { provideServerFns, withServerFnInterceptors } from './interceptors';
import { withAllowedOrigins } from './same-origin';
import { fail } from '../../actions/src/actions';
import type { StandardSchemaV1 } from '@analogjs/router';

@Injectable()
class Greeter {
  greet(name: string) {
    return `hello ${name}`;
  }
}

const stringInput: StandardSchemaV1<{ name: string }> = {
  '~standard': {
    version: 1,
    vendor: 'spec',
    validate: (value: unknown) =>
      typeof (value as { name?: unknown })?.name === 'string'
        ? { value: value as { name: string } }
        : { issues: [{ message: 'name must be a string' }] },
  },
};

const eventFor = (headers: Record<string, string> = {}) =>
  ({ node: { req: { headers }, res: {} } }) as never;

const jsonPost = { 'content-type': 'application/json' };

describe('dispatchServerFn', () => {
  beforeEach(() => serverFnRegistry.clear());

  it('runs the handler in an injection context with the parent app injector', async () => {
    serverFn({ id: 'greet', input: stringInput }, async (input) => {
      const greeter = inject(Greeter);
      const req = inject(REQUEST);
      return `${greeter.greet(input.name)} from ${req?.headers['host']}`;
    });

    const parent = Injector.create({
      providers: [{ provide: Greeter, useClass: Greeter, deps: [] }],
    });

    const result = await dispatchServerFn(
      'greet',
      { name: 'ada' },
      eventFor({ ...jsonPost, host: 'localhost' }),
      { parent, method: 'POST' },
    );

    expect(result).toEqual({ status: 200, body: 'hello ada from localhost' });
  });

  it('provides the request tokens a component would see during SSR', async () => {
    serverFn({ id: 'tokens' }, async () => ({
      baseUrl: inject(BASE_URL),
      locale: inject(LOCALE, { optional: true }),
    }));

    const result = await dispatchServerFn(
      'tokens',
      undefined,
      eventFor({ host: 'example.com', 'accept-language': 'fr-CA,fr;q=0.9' }),
      { method: 'GET' },
    );

    expect(result.body).toEqual({
      baseUrl: 'http://example.com',
      locale: 'fr-CA',
    });
  });

  it('keeps each Set-Cookie separate instead of comma-joining them', async () => {
    serverFn({ id: 'cookies' }, async () => {
      const headers = new Headers();
      headers.append('set-cookie', 'a=1; Path=/');
      headers.append('set-cookie', 'b=2; Path=/');
      return new Response(null, { status: 204, headers });
    });

    const result = await dispatchServerFn('cookies', undefined, eventFor(), {
      method: 'GET',
    });

    expect(result.headers?.['set-cookie']).toEqual([
      'a=1; Path=/',
      'b=2; Path=/',
    ]);
  });

  it('resolves whatever the parent injector provides', async () => {
    // `dispatchServerFn` resolves against the parent it is handed and nothing
    // more. A plain `Injector.create` resolves only listed providers, not
    // tree-shakeable `providedIn: 'root'` ones — which is exactly why the
    // generated endpoint hands it a *bootstrapped* app injector
    // (`createServerFnAppInjector`) rather than a constructed one, so `root`
    // services resolve over HTTP the same as during SSR.
    @Injectable()
    class ListedService {
      value = 'listed';
    }

    serverFn({ id: 'listed-di' }, async () => inject(ListedService).value);

    const result = await dispatchServerFn('listed-di', undefined, eventFor(), {
      parent: Injector.create({
        providers: [
          { provide: ListedService, useClass: ListedService, deps: [] },
        ],
      }),
      method: 'GET',
    });

    expect(result.body).toBe('listed');
  });

  it('404s an unknown function', async () => {
    const result = await dispatchServerFn('nope', undefined, eventFor(), {
      method: 'GET',
    });

    expect(result.status).toBe(404);
  });

  it('405s a method the function is not configured for', async () => {
    serverFn({ id: 'read' }, async () => 'ok');

    const result = await dispatchServerFn(
      'read',
      undefined,
      eventFor(jsonPost),
      {
        method: 'POST',
      },
    );

    expect(result.status).toBe(405);
    expect(result.headers).toEqual({ Allow: 'GET' });
  });

  it('415s an input-bearing call that is not JSON', async () => {
    serverFn({ id: 'write', input: stringInput }, async () => 'ok');

    const result = await dispatchServerFn(
      'write',
      'name=ada',
      eventFor({ 'content-type': 'application/x-www-form-urlencoded' }),
      { method: 'POST' },
    );

    expect(result.status).toBe(415);
  });

  it('400s input that fails validation, without running the handler', async () => {
    let ran = false;
    serverFn({ id: 'validated', input: stringInput }, async () => {
      ran = true;
      return 'ok';
    });

    const result = await dispatchServerFn(
      'validated',
      { name: 42 },
      eventFor(jsonPost),
      { method: 'POST' },
    );

    expect(result.status).toBe(400);
    expect(ran).toBe(false);
  });

  it('short-circuits on an interceptor Response, keeping its headers', async () => {
    serverFn({ id: 'guarded' }, async () => 'never');

    const parent = Injector.create({
      providers: provideServerFns(
        withServerFnInterceptors([() => fail(401, { message: 'nope' })]),
      ) as never,
    });

    const result = await dispatchServerFn('guarded', undefined, eventFor(), {
      parent,
      method: 'GET',
    });

    expect(result.status).toBe(401);
    expect(result.body).toEqual({ message: 'nope' });
    expect(result.headers?.['x-analog-errors']).toBe('true');
  });

  it('403s a cross-origin browser call before looking the function up', async () => {
    const result = await dispatchServerFn(
      'unknown-id',
      undefined,
      eventFor({ 'sec-fetch-site': 'cross-site' }),
      { method: 'GET' },
    );

    // 403 rather than 404: an unknown id must not be distinguishable from a
    // known one across origins.
    expect(result.status).toBe(403);
  });

  it('allows a cross-origin call from an origin registered through DI', async () => {
    serverFn({ id: 'open' }, async () => 'ok');

    const parent = Injector.create({
      providers: provideServerFns(
        withAllowedOrigins(['https://trusted.example']),
      ) as never,
    });

    const result = await dispatchServerFn(
      'open',
      undefined,
      eventFor({
        'sec-fetch-site': 'cross-site',
        origin: 'https://trusted.example',
      }),
      { parent, method: 'GET' },
    );

    expect(result.status).toBe(200);
  });

  it('exempts in-process callers (no method) from the transport guards', async () => {
    serverFn({ id: 'ssr' }, async () => 'ok');

    const result = await dispatchServerFn(
      'ssr',
      undefined,
      eventFor({ 'sec-fetch-site': 'cross-site' }),
    );

    expect(result).toEqual({ status: 200, body: 'ok' });
  });
});
