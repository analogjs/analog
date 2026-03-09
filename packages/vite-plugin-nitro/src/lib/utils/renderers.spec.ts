import { describe, expect, it } from 'vitest';

import { apiMiddleware, clientRenderer, ssrRenderer } from './renderers';

describe('renderers virtual modules', () => {
  it('emits an SSR renderer that serves HTML responses', () => {
    const templatePath = '/dist/apps/demo-app/client/index.html';
    const moduleSource = ssrRenderer(templatePath);

    expect(moduleSource).toContain(JSON.stringify(templatePath));
    expect(moduleSource).toContain(
      "event.res.headers.set('content-type', 'text/html; charset=utf-8');",
    );
    expect(moduleSource).toContain('const req = event.node?.req ?? {');
  });

  it('emits a client renderer that serves HTML responses', () => {
    const templatePath = '/dist/apps/demo-app/client/index.html';
    const moduleSource = clientRenderer(templatePath);

    expect(moduleSource).toContain(JSON.stringify(templatePath));
    expect(moduleSource).toContain(
      "event.res.headers.set('content-type', 'text/html; charset=utf-8');",
    );
  });

  it('uses event-bound forwarding for API middleware', () => {
    expect(apiMiddleware).toContain(
      "import { defineHandler, fetchWithEvent, proxyRequest } from 'h3';",
    );
    expect(apiMiddleware).toContain('return fetchWithEvent(event, reqUrl');
    expect(apiMiddleware).toContain('return proxyRequest(event, reqUrl);');
  });
});
