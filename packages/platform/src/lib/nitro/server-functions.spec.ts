import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import {
  discoverServerFunctions,
  registerServerFunctions,
  SERVER_FUNCTION_HANDLER,
  serverFunctionHandlerSource,
  serverFunctionIdsPlugin,
} from './server-functions';
import { deriveServerFnId } from '../server-fn-id';

const roots: string[] = [];
function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'analog-server-functions-'));
  roots.push(root);
  mkdirSync(join(root, 'src/app'), { recursive: true });
  return root;
}
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});
const source = `import { serverFn as sf } from '@analogjs/router/server'; export const read = sf(async () => 'value');`;

describe('split Nitro server functions', () => {
  it('discovers canonical aliased server functions without importing unrelated server modules', () => {
    const root = fixture();
    const expected = join(root, 'src/app/read.server.ts');
    writeFileSync(expected, source);
    writeFileSync(
      join(root, 'src/app/load.server.ts'),
      'throw new Error("must not run"); export const load = () => {};',
    );
    writeFileSync(
      join(root, 'src/app/private.server.ts'),
      'function serverFn() {} export const unrelated = serverFn();',
    );
    writeFileSync(
      join(root, 'src/app/type.server.ts'),
      `import type { ServerFn } from '@analogjs/router'; export type Ref = ServerFn<void, string>;`,
    );
    expect(
      discoverServerFunctions(root, [join(root, 'src'), join(root, 'src/app')]),
    ).toEqual([expected.replaceAll('\\', '/')]);
  });

  it('rejects an unrewritable server-function export before generating a broken dispatch route', () => {
    const root = fixture();
    writeFileSync(
      join(root, 'src/app/read.server.ts'),
      `import { serverFn } from '@analogjs/router/server'; const read = serverFn(async () => 1); export { read };`,
    );
    expect(() => discoverServerFunctions(root, [join(root, 'src')])).toThrow(
      'directly exported const',
    );
  });

  it('does not register an HTTP route when no server functions exist', () => {
    const root = fixture();
    const nitro: Parameters<typeof registerServerFunctions>[0] = {
      options: { handlers: [], virtual: {} },
    };
    expect(
      registerServerFunctions(nitro, {
        projectRoot: root,
        directories: [join(root, 'src')],
      }),
    ).toBe(false);
    expect(nitro.options.handlers).toEqual([]);
    expect(nitro.options.virtual).toEqual({});
  });

  it('registers cold dispatch and the same conventional application config used by SSR', () => {
    const root = fixture();
    const file = join(root, 'src/app/read.server.ts');
    const config = join(root, 'src/app/app.config.server.ts');
    writeFileSync(file, source);
    writeFileSync(config, 'export const config = { providers: [] };');
    const nitro: Parameters<typeof registerServerFunctions>[0] = {
      options: { handlers: [], virtual: {} },
    };
    expect(
      registerServerFunctions(nitro, {
        projectRoot: root,
        directories: [join(root, 'src')],
      }),
    ).toBe(true);
    expect(nitro.options.handlers).toEqual([
      {
        route: '/_analog/fn/:id',
        handler: SERVER_FUNCTION_HANDLER,
        lazy: true,
      },
    ]);
    expect(serverFunctionHandlerSource([file], config)).toContain(
      'createServerFnEventHandler(createServerFnAppInjector(config))',
    );
    expect(serverFunctionHandlerSource([file], config)).toContain(
      JSON.stringify(config),
    );
    expect(nitro.options.virtual['#analog/server-function-mode']).toContain(
      'ngServerMode = true',
    );
  });

  it('uses the same project-relative IDs in the Nitro registration graph', () => {
    const root = fixture();
    const result = serverFunctionIdsPlugin(root).transform(
      source,
      join(root, 'src/app/read.server.ts'),
    );
    expect(result?.code).toContain(
      deriveServerFnId('src/app/read.server.ts', 'read'),
    );
    expect(result?.code).toContain("async () => 'value'");
  });

  it('rejects ambiguous application configs rather than silently selecting different HTTP providers', () => {
    const root = fixture();
    writeFileSync(join(root, 'src/app/read.server.ts'), source);
    writeFileSync(
      join(root, 'src/app/app.config.server.ts'),
      'export const config = { providers: [] };',
    );
    writeFileSync(
      join(root, 'src/app.config.server.ts'),
      'export const config = { providers: [] };',
    );
    const nitro: Parameters<typeof registerServerFunctions>[0] = {
      options: { handlers: [], virtual: {} },
    };
    expect(() =>
      registerServerFunctions(nitro, {
        projectRoot: root,
        directories: [join(root, 'src')],
      }),
    ).toThrow('app config is ambiguous');
    expect(nitro.options.handlers).toEqual([]);
  });
});
