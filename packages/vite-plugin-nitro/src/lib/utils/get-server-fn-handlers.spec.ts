import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { normalizePath } from 'vite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

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
      `export const getProducts = serverFn({ id: 'getProducts' }, async () => []);`,
    );
    // A page server file may also host a server function.
    writeFileSync(
      join(workspaceRoot, 'src/app/pages/shipping/index.server.ts'),
      `export default async function load() { return {}; }`,
    );
    // Angular SSR config — matched by the glob but must be excluded.
    writeFileSync(
      join(workspaceRoot, 'src/app/app.config.server.ts'),
      `export const config = {};`,
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
      `export const getReport = serverFn({ id: 'getReport' }, async () => ({}));`,
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
