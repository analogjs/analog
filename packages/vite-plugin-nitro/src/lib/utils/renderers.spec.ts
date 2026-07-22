import { describe, expect, it, vi } from 'vitest';

import { apiMiddleware, clientRenderer, ssrRenderer } from './renderers';

// Compiles the apiMiddleware string template into an executable handler with
// mocked nitro/h3 dependencies so its URL-boundary logic can be exercised.
function createApiMiddleware(apiPrefix: string) {
  const fetchMock = vi.fn(async () => 'fetched');
  const proxyMock = vi.fn(async () => 'proxied');

  const body = apiMiddleware
    .replace(/import[^;]+;/g, '')
    .replace(
      'export default defineHandler(async (event) => {',
      'return (async (event) => {',
    )
    .replace(/}\);$/, '});');

  const factory = new Function(
    'defineHandler',
    'fetchWithEvent',
    'proxyRequest',
    'createError',
    'useRuntimeConfig',
    body,
  );

  const handler = factory(
    (fn: unknown) => fn,
    fetchMock,
    proxyMock,
    ({ statusCode }: { statusCode: number }) => {
      const error = new Error('createError') as Error & { statusCode: number };
      error.statusCode = statusCode;
      return error;
    },
    () => ({ prefix: '', apiPrefix }),
  );

  const run = (path: string, method = 'GET') =>
    handler({ path, method, req: { headers: new Headers() } });

  return { run, fetchMock, proxyMock };
}

describe('renderers virtual modules', () => {
  it('emits an SSR renderer that serves HTML responses', () => {
    const moduleSource = ssrRenderer();

    expect(moduleSource).toContain("import template from '#analog/index';");
    expect(moduleSource).not.toContain('readFileSync(');
    expect(moduleSource).toContain(
      "event.res.headers.set('content-type', 'text/html; charset=utf-8');",
    );
    expect(moduleSource).toContain(
      'const requestPath = normalizeHtmlRequestUrl(event.path);',
    );
    expect(moduleSource).toContain('const req = event.node?.req');
    expect(moduleSource).toContain(
      'const html = await renderer(requestPath, template, { req, res, fetch: serverFetch });',
    );
    expect(moduleSource).toContain("import renderer from '#analog/ssr';");
  });

  it('emits a client renderer that serves HTML responses', () => {
    const moduleSource = clientRenderer();

    expect(moduleSource).toContain("import template from '#analog/index';");
    expect(moduleSource).not.toContain('readFileSync(');
    expect(moduleSource).toContain(
      "event.res.headers.set('content-type', 'text/html; charset=utf-8');",
    );
  });

  it('uses event-bound forwarding for API middleware', () => {
    expect(apiMiddleware).toContain(
      "import { createError, defineHandler, fetchWithEvent, proxyRequest } from 'nitro/h3';",
    );
    expect(apiMiddleware).toContain('return fetchWithEvent(event, reqUrl');
    expect(apiMiddleware).toContain('return proxyRequest(event, reqUrl);');
  });
});

describe('apiMiddleware routing', () => {
  it('forwards a legitimate API request with the prefix stripped', async () => {
    const { run, fetchMock } = createApiMiddleware('api');
    await run('/api/hello');
    expect(fetchMock).toHaveBeenCalledWith(
      expect.anything(),
      '/hello',
      expect.anything(),
    );
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
