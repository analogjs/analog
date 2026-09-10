import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { devServerPlugin } from './dev-server-plugin';
vi.mock('../utils/register-dev-middleware', () => ({
  registerDevServerMiddleware: vi.fn(),
}));

let root: string;
afterEach(() => {
  if (root) rmSync(root, { recursive: true, force: true });
});

describe('development route rules', () => {
  it('uses canonical paths, method rules, and specific SSR overrides', async () => {
    root = mkdtempSync(join(tmpdir(), 'analog-dev-rules-'));
    mkdirSync(join(root, 'src'));
    writeFileSync(join(root, 'index.html'), 'shell');
    const plugin = devServerPlugin({
      routeRules: {
        '/**': { ssr: false },
        '/live': { ssr: true },
        'POST /live': { ssr: false },
      },
    }) as any;
    plugin.config({ root, base: '/base/' }, { mode: 'development' });
    const render = vi.fn(async () => 'rendered');
    const middlewares = { use: vi.fn(), stack: [] };
    const server = {
      config: { root },
      middlewares,
      transformIndexHtml: vi.fn(async (_url, template) => template),
      ssrLoadModule: vi.fn(async () => ({ default: render })),
    };
    await plugin.configureServer(server)();
    const handler = middlewares.use.mock.calls[0][0];
    for (const [url, method, expected] of [
      ['/base/static?q=.js', 'GET', 'shell'],
      ['/base/live?q=1', 'GET', 'rendered'],
      ['/base/%6cive', 'GET', 'rendered'],
      ['/base/live', 'POST', 'shell'],
    ]) {
      const response = { setHeader: vi.fn(), end: vi.fn() };
      await handler({ originalUrl: url, url, method }, response);
      expect(response.end).toHaveBeenCalledWith(expected);
    }
    expect(render).toHaveBeenCalledTimes(2);
  });
});
