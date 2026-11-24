import { describe, expect, it } from 'vitest';
import { SERVER_MODE_ID, serverModePlugin } from './server-mode-plugin.js';

describe('serverModePlugin', () => {
  const [plugin] = serverModePlugin();
  const resolveId = plugin.resolveId as (id: string) => string | undefined;
  const load = plugin.load as (id: string) => string | undefined;

  it('serves a module that sets ngServerMode before app modules evaluate', () => {
    const resolved = resolveId(SERVER_MODE_ID);

    expect(resolved).toBe(`\0${SERVER_MODE_ID}`);
    expect(load(resolved!)).toContain('globalThis.ngServerMode = true;');
  });

  it('ignores other ids', () => {
    expect(resolveId('/src/main.server.ts')).toBeUndefined();
    expect(load('/src/main.server.ts')).toBeUndefined();
  });

  describe('SSR entry', () => {
    function setup(entryServer?: string) {
      const [entryPlugin] = serverModePlugin(entryServer);
      (entryPlugin.configResolved as any)({ root: '/app' });
      return (code: string, id: string, ssr: boolean) =>
        (entryPlugin.transform as any)(code, id, { ssr });
    }

    it('imports the server mode module first', () => {
      const transform = setup();

      expect(
        transform('export default {};', '/app/src/main.server.ts', true).code,
      ).toBe(`import "${SERVER_MODE_ID}";\nexport default {};`);
    });

    it('leaves other modules and the client build alone', () => {
      const transform = setup('src/main-custom.server.ts');

      expect(transform('', '/app/src/main.server.ts', true)).toBeUndefined();
      expect(
        transform('', '/app/src/main-custom.server.ts', false),
      ).toBeUndefined();
    });
  });
});
