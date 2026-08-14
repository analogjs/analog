import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { OnLoadResult, PluginBuild } from 'esbuild';

import {
  analogRouterPlugin,
  createRouteFilesModule,
  discoverRouteFiles,
  ROUTE_FILES_ID,
} from './analog-router-plugin';

describe('analogRouterPlugin', () => {
  let root: string;

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'analog-esbuild-')).replace(/\\/g, '/');
    mkdirSync(join(root, 'src/app/pages/products'), { recursive: true });
    writeFileSync(join(root, 'src/app/pages/index.page.ts'), 'export {};');
    writeFileSync(
      join(root, 'src/app/pages/products/[productId].page.ts'),
      'export {};',
    );
    writeFileSync(join(root, 'src/app/pages/not-a-page.ts'), 'export {};');
    mkdirSync(join(root, 'src/content'), { recursive: true });
    writeFileSync(join(root, 'src/content/about.md'), '# About\n');
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('discovers only page route files', () => {
    const files = discoverRouteFiles(root, root);

    expect(files).toHaveLength(2);
    expect(files).toContain(`${root}/src/app/pages/index.page.ts`);
    expect(files).toContain(
      `${root}/src/app/pages/products/[productId].page.ts`,
    );
  });

  it('generates a module with root-relative keys and absolute imports', () => {
    const files = discoverRouteFiles(root, root);
    const code = createRouteFilesModule(files, root);

    expect(code).toContain(
      `"/src/app/pages/index.page.ts": () => import('${root}/src/app/pages/index.page.ts')`,
    );
    expect(code).toContain('"/src/app/pages/products/[productId].page.ts"');
  });

  it.each([
    ['browser', { ngServerMode: 'false' }, false],
    ['server via ngServerMode', { ngServerMode: 'true' }, true],
  ])('defines import.meta.env per bundle (%s)', (_name, define, expected) => {
    const initialOptions: Record<string, unknown> = { define: { ...define } };
    const build = {
      initialOptions,
      onResolve: () => undefined,
      onLoad: () => undefined,
    } as unknown as PluginBuild;

    analogRouterPlugin({ workspaceRoot: root, dev: true }).setup(build);

    const env = JSON.parse(
      (initialOptions['define'] as Record<string, string>)['import.meta.env'],
    );
    expect(env.SSR).toBe(expected);
    expect(env.DEV).toBe(true);
  });

  it('treats a node platform bundle as the server bundle', () => {
    const initialOptions: Record<string, unknown> = { platform: 'node' };
    const build = {
      initialOptions,
      onResolve: () => undefined,
      onLoad: () => undefined,
    } as unknown as PluginBuild;

    analogRouterPlugin({ workspaceRoot: root }).setup(build);

    const env = JSON.parse(
      (initialOptions['define'] as Record<string, string>)['import.meta.env'],
    );
    expect(env).toEqual({ DEV: false, SSR: true });
  });

  it('resolves and loads the virtual route files module', async () => {
    const hooks: {
      resolve?: [unknown, (args: unknown) => unknown];
      load?: [unknown, (args: unknown) => OnLoadResult];
    } = {};
    const build = {
      initialOptions: {},
      onResolve: (opts: unknown, cb: never) => (hooks.resolve = [opts, cb]),
      onLoad: (opts: unknown, cb: never) => (hooks.load = [opts, cb]),
    } as unknown as PluginBuild;

    analogRouterPlugin({ workspaceRoot: root }).setup(build);

    const resolved = hooks.resolve![1]({ path: ROUTE_FILES_ID }) as {
      path: string;
      namespace: string;
    };
    expect(resolved.path).toBe(ROUTE_FILES_ID);

    const loaded = hooks.load![1]({ path: resolved.path });
    expect(loaded.contents).toContain('/src/app/pages/index.page.ts');
    expect(loaded.resolveDir).toBe(root);
    expect(loaded.watchDirs).toContain(`${root}/src/app/pages`);
    expect(loaded.watchDirs).toContain(`${root}/src/content`);
    expect(loaded.contents).toContain(
      `"/src/content/about.md": () => import('${root}/src/content/about.md').then((m) => m.default)`,
    );
  });
});
