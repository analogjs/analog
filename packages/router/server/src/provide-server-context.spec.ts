import { ServerRequest } from '@analogjs/router/tokens';
import { getBaseUrl, getRequestProtocol } from './provide-server-context';

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
});
