import { describe, expect, it } from 'vitest';

import { apiMiddleware, clientRenderer, ssrRenderer } from './renderers';

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
      "import { defineHandler, fetchWithEvent, proxyRequest } from 'nitro/h3';",
    );
    expect(apiMiddleware).toContain('return fetchWithEvent(event, reqUrl');
    expect(apiMiddleware).toContain('return proxyRequest(event, reqUrl);');
  });
});
