import { describe, expect, it } from 'vitest';

import { pageEndpointsPlugin } from './plugins/page-endpoints';

describe('pageEndpointsPlugin', () => {
  const plugin = pageEndpointsPlugin();

  it('uses Nitro runtime $fetch instead of a private nitro import', async () => {
    const result = await plugin.transform?.(
      `export const load = () => ({ ok: true });`,
      '/src/app/pages/index.server.ts',
    );

    expect(result).toBeDefined();
    expect(result?.code).toContain(
      'export default defineHandler(async(event) => {',
    );
    expect(result?.code).toContain(`import { createFetch } from 'ofetch';`);
    expect(result?.code).toContain('fetchWithEvent');
    expect(result?.code).toContain('const serverFetch = createFetch');
    expect(result?.code).toContain('fetch: serverFetch');
    expect(result?.code).not.toContain(`nitro/deps/ofetch`);
  });

  it('generates a default load when only action is exported', async () => {
    const result = await plugin.transform?.(
      `export const action = () => ({ saved: true });`,
      '/src/app/pages/index.server.ts',
    );

    expect(result).toBeDefined();
    expect(result?.code).toContain('export const load = () =>');
    expect(result?.code).toContain(
      'export const action = () => ({ saved: true })',
    );
  });

  it('uses both exports when load and action are provided', async () => {
    const result = await plugin.transform?.(
      `export const load = () => ({ ok: true });\nexport const action = () => ({ saved: true });`,
      '/src/app/pages/index.server.ts',
    );

    expect(result).toBeDefined();
    expect(result?.code).toContain('export const load = () => ({ ok: true })');
    expect(result?.code).toContain(
      'export const action = () => ({ saved: true })',
    );
    // should not generate default stubs
    expect(result?.code).not.toContain('return {};');
  });

  it('generates default load and action when neither is exported', async () => {
    const result = await plugin.transform?.(
      `export const helper = () => 42;`,
      '/src/app/pages/index.server.ts',
    );

    expect(result).toBeDefined();
    expect(result?.code).toContain('export const load = () =>');
    expect(result?.code).toContain('export const action = () =>');
    // both stubs return empty objects
    const stubs = (result?.code.match(/return \{\};/g) || []).length;
    expect(stubs).toBe(2);
  });

  it('skips files that are not .server.ts', async () => {
    const result = await plugin.transform?.(
      `export const load = () => ({ ok: true });`,
      '/src/app/pages/index.ts',
    );

    expect(result).toBeUndefined();
  });

  it('skips .server.ts files outside /pages/', async () => {
    const result = await plugin.transform?.(
      `export const load = () => ({ ok: true });`,
      '/src/app/services/auth.server.ts',
    );

    expect(result).toBeUndefined();
  });
});
