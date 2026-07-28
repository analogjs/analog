import { describe, expect, it, vi } from 'vitest';

import { apiMiddleware } from './renderers';

// Compiles the apiMiddleware string template into an executable handler with
// mocked h3/#imports dependencies so its URL-boundary logic can be exercised.
function createApiMiddleware(apiPrefix: string) {
  const fetchMock = vi.fn(async () => 'fetched');
  const proxyMock = vi.fn(async () => 'proxied');

  const body = apiMiddleware
    .replace(/import[^;]+;/g, '')
    .replace(
      'export default eventHandler(async (event) => {',
      'return (async (event) => {',
    )
    .replace(/}\);$/, '});');

  const factory = new Function(
    'eventHandler',
    'proxyRequest',
    'createError',
    'useRuntimeConfig',
    '$fetch',
    body,
  );

  const handler = factory(
    (fn: unknown) => fn,
    proxyMock,
    ({ statusCode }: { statusCode: number }) => {
      const error = new Error('createError') as Error & { statusCode: number };
      error.statusCode = statusCode;
      return error;
    },
    () => ({ prefix: '', apiPrefix }),
    Object.assign(fetchMock, { native: fetchMock }),
  );

  const run = (url: string, method = 'GET') =>
    handler({ node: { req: { url, method, headers: {} } } });

  return { run, fetchMock, proxyMock };
}

describe('apiMiddleware', () => {
  it('forwards a legitimate API request with the prefix stripped', async () => {
    const { run, fetchMock } = createApiMiddleware('api');
    await run('/api/hello');
    expect(fetchMock).toHaveBeenCalledWith('/hello', expect.anything());
  });

  it('does not match when the prefix is not on a path boundary', async () => {
    const { run, fetchMock, proxyMock } = createApiMiddleware('api');
    const result = await run('/apihttp://127.0.0.1:9911/secret.txt');
    expect(result).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(proxyMock).not.toHaveBeenCalled();
  });

  it('rejects protocol-relative targets to prevent SSRF', async () => {
    const { run, fetchMock } = createApiMiddleware('api');
    await expect(run('/api//127.0.0.1:9911/secret.txt')).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not proxy an absolute URL on non-GET methods', async () => {
    const { run, proxyMock } = createApiMiddleware('api');
    const result = await run('/apihttp://127.0.0.1:9911/admin', 'POST');
    expect(result).toBeUndefined();
    expect(proxyMock).not.toHaveBeenCalled();
  });
});
