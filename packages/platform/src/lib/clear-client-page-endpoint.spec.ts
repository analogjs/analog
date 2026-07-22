import { describe, expect, it } from 'vitest';

import { clearClientPageEndpointsPlugin } from './clear-client-page-endpoint.js';

const SERVER_FN_MODULE = `
import { inject } from '@angular/core';
import { serverFn } from '@analogjs/router/server';
import { CatalogService } from './catalog.service';

export const getProducts = serverFn(async () => inject(CatalogService).list());
`;

const PAGE_ENDPOINT = `export const load = async () => ({ loaded: true });`;

function transform(
  code: string,
  id: string,
  { ssr, command }: { ssr?: boolean; command?: 'serve' | 'build' } = {},
) {
  const plugin = clearClientPageEndpointsPlugin();
  (plugin.configResolved as any).call(plugin, {
    root: '/ws/app',
    command: command ?? 'build',
  });
  return (plugin.transform as any).call(plugin, code, id, { ssr: !!ssr });
}

describe('clearClientPageEndpointsPlugin', () => {
  it('stamps ids into the SSR module while keeping the handler', () => {
    const result = transform(
      SERVER_FN_MODULE,
      '/ws/app/src/app/server-fns/products.server.ts',
      { ssr: true },
    );

    expect(result.code).toContain('id:');
    expect(result.code).toContain('CatalogService');
  });

  it('runs during dev, not only for builds', () => {
    // The dev SSR request needs the ids too; without them `serverFn` throws.
    const result = transform(
      SERVER_FN_MODULE,
      '/ws/app/src/app/server-fns/products.server.ts',
      { ssr: true, command: 'serve' },
    );

    expect(result.code).toContain('id:');
  });

  it('scrubs the client module to proxies and drops its sourcemap', () => {
    const result = transform(
      SERVER_FN_MODULE,
      '/ws/app/src/app/server-fns/products.server.ts',
    );

    expect(result.code).toContain('createServerFnRef');
    expect(result.code).not.toContain('CatalogService');
    // An empty mapping rather than null: a null map lets the original server
    // source survive in `sourcesContent` and reach the browser.
    expect(result.map).toEqual({ mappings: '' });
  });

  it('empties page endpoints on the client build only', () => {
    const id = '/ws/app/src/app/pages/index.server.ts';

    expect(transform(PAGE_ENDPOINT, id).code).toBe('export default undefined;');
    expect(transform(PAGE_ENDPOINT, id, { command: 'serve' })).toBeUndefined();
  });

  it('ignores modules that are not .server.ts', () => {
    expect(
      transform(SERVER_FN_MODULE, '/ws/app/src/app/catalog.service.ts'),
    ).toBeUndefined();
  });
});
