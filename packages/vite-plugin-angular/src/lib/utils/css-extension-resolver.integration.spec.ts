import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, normalizePath, type ViteDevServer } from 'vite';
import { cssExtensionStyleResolverPlugin } from './css-extension-resolver.js';

describe('cssExtensionStyleResolverPlugin with Vite resolution', () => {
  let root: string;
  let server: ViteDevServer;

  beforeAll(async () => {
    root = normalizePath(
      realpathSync(mkdtempSync(join(tmpdir(), 'analog-style-condition-'))),
    );
    const pkgDir = join(root, 'node_modules/style-pkg');
    mkdirSync(join(pkgDir, 'dist/button'), { recursive: true });
    writeFileSync(
      join(pkgDir, 'package.json'),
      JSON.stringify({
        name: 'style-pkg',
        exports: {
          './stylesheets/*': {
            style: './dist/*/stylesheet.css',
            default: './dist/*/stylesheet.js',
          },
          './theme.css': { style: './dist/theme.css' },
        },
      }),
    );
    writeFileSync(join(pkgDir, 'dist/button/stylesheet.css'), '');
    writeFileSync(join(pkgDir, 'dist/button/stylesheet.js'), '');
    writeFileSync(join(pkgDir, 'dist/theme.css'), '');
    writeFileSync(join(root, 'main.ts'), '');

    server = await createServer({
      root,
      configFile: false,
      logLevel: 'silent',
      server: { middlewareMode: true, ws: false },
      optimizeDeps: { noDiscovery: true },
      plugins: [cssExtensionStyleResolverPlugin()],
    });
  });

  afterAll(async () => {
    await server?.close();
    rmSync(root, { recursive: true, force: true });
  });

  const resolve = async (id: string) =>
    (
      await server.environments.client.pluginContainer.resolveId(
        id,
        `${root}/main.ts`,
      )
    )?.id;

  it('resolves JS imports to the default export instead of `style` (#2381)', async () => {
    expect(await resolve('style-pkg/stylesheets/button')).toBe(
      `${root}/node_modules/style-pkg/dist/button/stylesheet.js`,
    );
  });

  it('resolves `.css` imports gated only under `style`', async () => {
    expect(await resolve('style-pkg/theme.css')).toBe(
      `${root}/node_modules/style-pkg/dist/theme.css`,
    );
  });
});
