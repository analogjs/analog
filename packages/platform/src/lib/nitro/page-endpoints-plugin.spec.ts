import { describe, expect, it } from 'vitest';

import { pageEndpointsPlugin } from './page-endpoints-plugin';

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

  it('safe-accesses event.context for params (handles internal fetchWithEvent dispatches)', async () => {
    const result = await plugin.transform?.(
      `export const load = () => ({ ok: true });`,
      '/src/app/pages/index.server.ts',
    );

    expect(result).toBeDefined();
    expect(result?.code).toContain('params: event.context?.params');
    expect(result?.code).not.toContain('params: event.context.params');
  });

  it('skips .server.ts files outside /pages/', async () => {
    const result = await plugin.transform?.(
      `export const load = () => ({ ok: true });`,
      '/src/app/services/auth.server.ts',
    );

    expect(result).toBeUndefined();
  });
});
