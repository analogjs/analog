import { describe, expect, it } from 'vitest';

import { pageEndpointsPlugin } from './plugins/page-endpoints';

describe('pageEndpointsPlugin', () => {
  it('uses Nitro runtime $fetch instead of a private nitro import', async () => {
    const plugin = pageEndpointsPlugin();
    const result = await plugin.transform?.(
      `export const load = () => ({ ok: true });`,
      '/src/app/pages/index.server.ts',
    );

    expect(result).toBeDefined();
    expect(result?.code).toContain('export default defineHandler(async(event) => {');
    expect(result?.code).toContain(`import { createFetch } from 'ofetch';`);
    expect(result?.code).toContain('fetchWithEvent');
    expect(result?.code).toContain('const serverFetch = createFetch');
    expect(result?.code).toContain('fetch: serverFetch');
    expect(result?.code).not.toContain(`nitro/deps/ofetch`);
  });
});
