import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildSSRApp } from './build-ssr.js';

type CountingGlobal = typeof globalThis & { __ssrPluginCounts?: number[] };

describe('buildSSRApp', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'analog-build-ssr-'));
    writeFileSync(join(root, 'main.server.ts'), 'export default () => "ok";\n');
    writeFileSync(
      join(root, 'vite.config.mjs'),
      `export default {
  logLevel: 'silent',
  plugins: [
    {
      name: 'count-plugin',
      configResolved(config) {
        globalThis.__ssrPluginCounts.push(
          config.plugins.filter((plugin) => plugin.name === 'count-plugin').length,
        );
      },
    },
  ],
};
`,
    );
    (globalThis as CountingGlobal).__ssrPluginCounts = [];
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
    delete (globalThis as CountingGlobal).__ssrPluginCounts;
  });

  it('builds with the plugins it is given instead of loading the config file again', async () => {
    const { default: userConfig } = await import(
      pathToFileURL(join(root, 'vite.config.mjs')).href
    );

    await buildSSRApp(
      { ...userConfig, root },
      {
        workspaceRoot: root,
        entryServer: join(root, 'main.server.ts'),
        ssrBuildDir: join(root, 'dist/ssr'),
      },
    );

    expect((globalThis as CountingGlobal).__ssrPluginCounts).toEqual([1]);
  });
});
