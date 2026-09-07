import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { normalizePath } from 'vite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { vi } from 'vitest';
import { nitro } from '../vite-plugin-nitro';
import { buildServer } from '../build-server';

vi.mock('../build-server');

import { getServerFnHandlers } from './get-server-fn-handlers';

describe('getServerFnHandlers', () => {
  let workspaceRoot: string;
  const rootDir = '.';
  const sourceRoot = 'src';

  beforeEach(() => {
    workspaceRoot = mkdtempSync(join(tmpdir(), 'analog-server-fn-'));
    mkdirSync(join(workspaceRoot, 'src/app/server-fns'), { recursive: true });
    mkdirSync(join(workspaceRoot, 'src/app/pages/shipping'), {
      recursive: true,
    });

    // Dedicated server-fn module.
    writeFileSync(
      join(workspaceRoot, 'src/app/server-fns/products.server.ts'),
      `import { serverFn } from '@analogjs/router/server'; export const getProducts = serverFn({ id: 'getProducts' }, async () => []);`,
    );
    // A page server file may also host a server function.
    writeFileSync(
      join(workspaceRoot, 'src/app/pages/shipping/index.server.ts'),
      `import { serverFn as defineServerFn } from '@analogjs/router/server';
       export const load = async () => ({});
       export const shipping = defineServerFn(async () => []);`,
    );
    // Angular SSR config — matched by the glob but must be excluded.
    writeFileSync(
      join(workspaceRoot, 'src/app/app.config.server.ts'),
      `export const config = {};`,
    );
    // SSR bootstrap entries: matched by the glob, but importing one would pull
    // the whole Angular app into the dispatch bundle.
    writeFileSync(
      join(workspaceRoot, 'src/main.server.ts'),
      `export default async function render() { return ''; }`,
    );
    writeFileSync(
      join(workspaceRoot, 'src/main-cf.server.ts'),
      `export default async function render() { return ''; }`,
    );
    // A non-server sibling that must never be picked up.
    writeFileSync(
      join(workspaceRoot, 'src/app/server-fns/catalog.service.ts'),
      `export class CatalogService {}`,
    );
  });

  afterEach(() => {
    rmSync(workspaceRoot, { recursive: true, force: true });
  });

  it('discovers *.server.ts modules across src, including page files', () => {
    const handlers = getServerFnHandlers({
      workspaceRoot,
      sourceRoot,
      rootDir,
    });
    const files = handlers.map((h) => h.file);

    expect(files).toContain(
      normalizePath(
        join(workspaceRoot, 'src/app/server-fns/products.server.ts'),
      ),
    );
    expect(files).toContain(
      normalizePath(
        join(workspaceRoot, 'src/app/pages/shipping/index.server.ts'),
      ),
    );
  });

  it('excludes app.config.server.ts and non-.server.ts files', () => {
    const files = getServerFnHandlers({
      workspaceRoot,
      sourceRoot,
      rootDir,
    }).map((h) => h.file);

    expect(files.some((f) => f.endsWith('app.config.server.ts'))).toBe(false);
    expect(files.some((f) => f.endsWith('catalog.service.ts'))).toBe(false);
  });

  it('excludes SSR entries sitting at the top of the source root', () => {
    const files = getServerFnHandlers({
      workspaceRoot,
      sourceRoot,
      rootDir,
    }).map((h) => h.file);

    expect(files.some((f) => f.endsWith('src/main.server.ts'))).toBe(false);
    expect(files.some((f) => f.endsWith('src/main-cf.server.ts'))).toBe(false);
  });

  it('keeps a page named main.server.ts, which is not an SSR entry', () => {
    writeFileSync(
      join(workspaceRoot, 'src/app/pages/main.server.ts'),
      `import { serverFn } from '@analogjs/router/server'; export const main = serverFn(async () => ({}));`,
    );

    const files = getServerFnHandlers({
      workspaceRoot,
      sourceRoot,
      rootDir,
    }).map((h) => h.file);

    expect(files.some((f) => f.endsWith('app/pages/main.server.ts'))).toBe(
      true,
    );
  });

  it.each([
    `export const load = async () => ({});`,
    `// import { serverFn } from '@analogjs/router/server';
     export const load = async () => ({ text: 'serverFn' });`,
    `import { serverFn } from 'another-library'; export const load = async () => ({});`,
    `import type { serverFn } from '@analogjs/router/server'; export const load = async () => ({});`,
    `import { type serverFn } from '@analogjs/router/server'; export const load = async () => ({});`,
  ])('excludes load-only modules: %s', (code) => {
    rmSync(join(workspaceRoot, 'src/app/server-fns'), { recursive: true });
    writeFileSync(
      join(workspaceRoot, 'src/app/pages/shipping/index.server.ts'),
      code,
    );
    expect(getServerFnHandlers({ workspaceRoot, sourceRoot, rootDir })).toEqual(
      [],
    );
  });

  it.each([false, true])(
    'wires dispatch only for runtime serverFn imports: %s',
    async (withServerFn) => {
      rmSync(join(workspaceRoot, 'src/app/server-fns'), { recursive: true });
      const page = join(
        workspaceRoot,
        'src/app/pages/shipping/index.server.ts',
      );
      writeFileSync(
        page,
        `export const load = async () => ({});` +
          (withServerFn
            ? `import { serverFn as defineFn } from '@analogjs/router/server'; export const getData = defineFn(async () => []);`
            : ''),
      );
      const plugin = nitro({ ssr: false, useAPIMiddleware: false })[1] as any;
      const config = await plugin.config(
        { root: workspaceRoot, build: {} },
        { command: 'build', mode: 'production' },
      );
      await config.builder.buildApp({
        build: vi.fn(),
        environments: { client: {} },
      });
      const nitroConfig = vi.mocked(buildServer).mock.calls.at(-1)![1];
      expect(
        nitroConfig.handlers?.some(
          (handler) =>
            typeof handler !== 'string' && handler.route === '/_analog/fn/:id',
        ),
      ).toBe(withServerFn);
      expect(
        JSON.stringify(nitroConfig.virtual).includes('@analogjs/router/server'),
      ).toBe(withServerFn);
      expect(
        nitroConfig.moduleSideEffects?.includes('@angular/compiler') ?? false,
      ).toBe(withServerFn);
      expect(
        nitroConfig.handlers?.some(
          (handler) =>
            typeof handler !== 'string' &&
            handler.handler.includes('shipping/index.server.ts'),
        ),
      ).toBe(true);
    },
  );

  it('wires dispatch for the conventional serverFn re-export that the client transforms', async () => {
    rmSync(join(workspaceRoot, 'src/app/server-fns'), { recursive: true });
    writeFileSync(
      join(workspaceRoot, 'src/app/server-fn.ts'),
      `export { serverFn } from '@analogjs/router/server';`,
    );
    const page = join(workspaceRoot, 'src/app/pages/shipping/index.server.ts');
    writeFileSync(
      page,
      `import { serverFn } from '../../server-fn';
       export const load = async () => ({});
       export const getData = serverFn(async () => []);`,
    );

    const plugin = nitro({ ssr: false, useAPIMiddleware: false })[1] as any;
    const config = await plugin.config(
      { root: workspaceRoot, build: {} },
      { command: 'build', mode: 'production' },
    );
    await config.builder.buildApp({
      build: vi.fn(),
      environments: { client: {} },
    });
    const nitroConfig = vi.mocked(buildServer).mock.calls.at(-1)![1];

    expect(
      nitroConfig.handlers?.some(
        (handler) =>
          typeof handler !== 'string' && handler.route === '/_analog/fn/:id',
      ),
    ).toBe(true);
    expect(
      JSON.stringify(nitroConfig.virtual).includes('shipping/index.server.ts'),
    ).toBe(true);
  });

  it('returns deterministic, de-duplicated, sorted output', () => {
    const first = getServerFnHandlers({ workspaceRoot, sourceRoot, rootDir });
    const second = getServerFnHandlers({ workspaceRoot, sourceRoot, rootDir });

    expect(first).toEqual(second);
    const files = first.map((h) => h.file);
    expect(files).toEqual([...files].sort());
    expect(new Set(files).size).toBe(files.length);
  });

  it('discovers modules in additional server-fn dirs', () => {
    mkdirSync(join(workspaceRoot, 'libs/shared/src'), { recursive: true });
    writeFileSync(
      join(workspaceRoot, 'libs/shared/src/reports.server.ts'),
      `import { serverFn } from '@analogjs/router/server'; export const getReport = serverFn({ id: 'getReport' }, async () => ({}));`,
    );

    const files = getServerFnHandlers({
      workspaceRoot,
      sourceRoot,
      rootDir,
      additionalServerFnDirs: ['/libs/shared/src'],
    }).map((h) => h.file);

    expect(
      files.some((f) => f.endsWith('libs/shared/src/reports.server.ts')),
    ).toBe(true);
  });
});
