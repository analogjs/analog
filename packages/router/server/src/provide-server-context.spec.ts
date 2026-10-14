import { LOCALE, type ServerRequest } from '../../tokens/src/index.js';
import {
  getBaseUrl,
  getRequestProtocol,
  provideServerContext,
} from './provide-server-context';

function createRequest({
  headers = {},
  originalUrl = '/',
  encrypted = false,
}: {
  headers?: Record<string, string | string[] | undefined>;
  originalUrl?: string;
  encrypted?: boolean;
}) {
  return {
    headers,
    originalUrl,
    url: originalUrl,
    connection: { encrypted },
  } as unknown as ServerRequest;
}

describe('provideServerContext', () => {
  it('prefers forwarded host and protocol headers', () => {
    const req = createRequest({
      headers: {
        host: 'localhost:4200',
        'x-forwarded-host': 'preview.analogjs.dev',
        'x-forwarded-proto': 'https, http',
      },
      originalUrl: '/notes/',
    });

    expect(getRequestProtocol(req)).toBe('https');
    expect(getBaseUrl(req)).toBe('https://preview.analogjs.dev');
  });

  it('falls back to localhost when the host header is missing', () => {
    const req = createRequest({
      originalUrl: '/notes',
    });

    expect(getBaseUrl(req)).toBe('http://localhost');
  });

  it('can ignore forwarded protocol headers when requested', () => {
    const req = createRequest({
      headers: {
        host: 'analogjs.dev',
        'x-forwarded-proto': 'https',
      },
      encrypted: false,
    });

    expect(getRequestProtocol(req, { xForwardedProto: false })).toBe('http');
  });

  it('uses the locale of a locale worker over the request', () => {
    vi.stubGlobal('ANALOG_I18N_FIXED_LOCALE', 'fr');
    const providers = provideServerContext({
      req: createRequest({ originalUrl: '/de/about' }),
      res: {} as never,
    });
    vi.unstubAllGlobals();

    expect(providers).toContainEqual({ provide: LOCALE, useValue: 'fr' });
  });
});
