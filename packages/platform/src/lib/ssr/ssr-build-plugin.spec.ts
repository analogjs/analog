import { beforeEach, describe, expect, it, vi } from 'vitest';

let mockRolldownVersion: string | undefined;

vi.mock('vite', async () => {
  const actual = await vi.importActual<typeof import('vite')>('vite');
  return {
    ...actual,
    get rolldownVersion() {
      return mockRolldownVersion;
    },
  };
});

import { ssrBuildPlugin } from './ssr-build-plugin.js';

describe('ssrBuildPlugin', () => {
  beforeEach(() => {
    mockRolldownVersion = undefined;
  });

  it('marks xhr2 as noExternal for SSR builds', () => {
    const [plugin] = ssrBuildPlugin();

    expect(plugin.config?.()).toEqual({
      ssr: {
        noExternal: ['xhr2'],
      },
    });
  });

  it('filters only the patched SSR dependency modules', () => {
    const [plugin] = ssrBuildPlugin();
    const filter = (plugin.transform as { filter: { id: RegExp } }).filter.id;

    expect(filter.test('/node_modules/zone-node/fesm2015/zone-node.js')).toBe(
      true,
    );
    expect(
      filter.test('/node_modules/@angular/platform-server/fesm2022/server.mjs'),
    ).toBe(true);
    expect(filter.test('/node_modules/xhr2/lib/xhr2.js')).toBe(true);
    expect(filter.test('/node_modules/domino/lib/sloppy.js')).toBe(true);
    expect(filter.test('/src/app/app.component.ts')).toBe(false);
  });

  it('removes the zone-node global alias', () => {
    const [plugin] = ssrBuildPlugin();
    const handler = (plugin.transform as { handler: Function }).handler;

    const result = handler(
      'const global = globalThis;\nconst zone = true;',
      '/node_modules/zone-node/fesm2015/zone-node.js',
    );

    expect(result).toEqual({
      code: '\nconst zone = true;',
    });
  });

  it('rewrites platform-server xhr2 and global references without Rolldown', () => {
    const [plugin] = ssrBuildPlugin();
    const handler = (plugin.transform as { handler: Function }).handler;

    const result = handler(
      [
        'const request = new xhr2.XMLHttpRequest();',
        'global.fetch();',
        'fn(global, value);',
        'return global[foo];',
      ].join('\n'),
      '/node_modules/@angular/platform-server/fesm2022/platform-server.mjs',
    );

    expect(result).toEqual({
      code: [
        'const request = new (xhr2.default.XMLHttpRequest || xhr2.default)();',
        'globalThis.fetch();',
        'fn(globalThis, value);',
        'return globalThis[foo];',
      ].join('\n'),
    });
  });

  it('patches xhr2 node-specific process and os accesses', () => {
    const [plugin] = ssrBuildPlugin();
    const handler = (plugin.transform as { handler: Function }).handler;

    const result = handler(
      [
        'const platform = os.type();',
        'const arch = os.arch();',
        'const nodeVersion = process.versions.node;',
        'const v8Version = process.versions.v8;',
      ].join('\n'),
      '/node_modules/xhr2/lib/xhr2.js',
    );

    expect(result).toEqual({
      code: [
        "const platform = '';",
        "const arch = '';",
        "const nodeVersion = 'node';",
        "const v8Version = 'v8';",
      ].join('\n'),
    });
  });

  it('replaces domino with() statements so the module stays ESM-safe', () => {
    const [plugin] = ssrBuildPlugin();
    const handler = (plugin.transform as { handler: Function }).handler;

    const result = handler(
      'with(window) { return document; }\nWITH(scope) { return location; }',
      '/node_modules/domino/lib/sloppy.js',
    );

    expect(result).toEqual({
      code: 'if(window) { return document; }\nif(scope) { return location; }',
    });
  });
});
