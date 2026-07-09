import { describe, expect, it } from 'vitest';

import { isServerFnOriginAllowed } from './same-origin';

describe('isServerFnOriginAllowed', () => {
  it('allows a same-origin browser request via Sec-Fetch-Site', () => {
    expect(
      isServerFnOriginAllowed({
        'sec-fetch-site': 'same-origin',
        origin: 'https://app.example.com',
        host: 'app.example.com',
      }),
    ).toBe(true);
  });

  it('allows a direct navigation (Sec-Fetch-Site: none)', () => {
    expect(isServerFnOriginAllowed({ 'sec-fetch-site': 'none' })).toBe(true);
  });

  it('rejects a cross-site browser request', () => {
    expect(
      isServerFnOriginAllowed({
        'sec-fetch-site': 'cross-site',
        origin: 'https://evil.example',
        host: 'app.example.com',
      }),
    ).toBe(false);
  });

  it('rejects a same-site (subdomain) request unless allow-listed', () => {
    const headers = {
      'sec-fetch-site': 'same-site',
      origin: 'https://evil.example.com',
      host: 'app.example.com',
    };
    expect(isServerFnOriginAllowed(headers)).toBe(false);
    expect(isServerFnOriginAllowed(headers, ['https://evil.example.com'])).toBe(
      true,
    );
  });

  it('allows a non-browser request that sends no origin signal at all', () => {
    // curl / server-to-server / SSR in-process: no Origin, no Sec-Fetch-Site.
    expect(isServerFnOriginAllowed({ 'user-agent': 'curl/8' })).toBe(true);
  });

  it('falls back to Origin-vs-host when Sec-Fetch-Site is absent', () => {
    expect(
      isServerFnOriginAllowed({
        origin: 'https://app.example.com',
        host: 'app.example.com',
      }),
    ).toBe(true);
    expect(
      isServerFnOriginAllowed({
        origin: 'https://evil.example',
        host: 'app.example.com',
      }),
    ).toBe(false);
  });

  it('honours X-Forwarded-Host ahead of Host in the fallback', () => {
    expect(
      isServerFnOriginAllowed({
        origin: 'https://app.example.com',
        'x-forwarded-host': 'app.example.com',
        host: 'internal.lb.local',
      }),
    ).toBe(true);
  });

  it('treats "*" in allowedOrigins as disabling the check', () => {
    expect(
      isServerFnOriginAllowed(
        {
          'sec-fetch-site': 'cross-site',
          origin: 'https://anything.example',
          host: 'app.example.com',
        },
        ['*'],
      ),
    ).toBe(true);
  });

  it('normalizes array-valued headers (takes the first)', () => {
    expect(
      isServerFnOriginAllowed({
        origin: ['https://app.example.com'],
        host: ['app.example.com'],
      }),
    ).toBe(true);
  });

  it('rejects a malformed Origin in the fallback path', () => {
    expect(
      isServerFnOriginAllowed({ origin: 'not a url', host: 'app.example.com' }),
    ).toBe(false);
  });
});
