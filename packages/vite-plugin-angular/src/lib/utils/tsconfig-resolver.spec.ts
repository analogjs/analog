import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { normalizePath, type ResolvedConfig } from 'vite';
import { TsconfigResolver } from './tsconfig-resolver.js';

describe('TsconfigResolver integration includes', () => {
  let workspaceRoot = '';

  beforeEach(() => {
    workspaceRoot = mkdtempSync(join(tmpdir(), 'analog-tsconfig-resolver-'));
    mkdirSync(join(workspaceRoot, 'libs/feature/src/pages'), {
      recursive: true,
    });
    writeFileSync(
      join(workspaceRoot, 'libs/feature/src/pages/index.page.ts'),
      'export default {};\n',
    );
  });

  afterEach(() => {
    rmSync(workspaceRoot, { recursive: true, force: true });
  });

  it('reuses a computed empty include set until files or configuration change', () => {
    const resolver = new TsconfigResolver({
      workspaceRoot,
      include: ['**/*.extra.ts'],
      liveReload: true,
      isTest: false,
    });
    const empty = resolver.ensureIncludeCache();
    expect(empty).toEqual([]);
    expect(resolver.ensureIncludeCache()).toBe(empty);
    const file = join(workspaceRoot, 'matching.extra.ts');
    writeFileSync(file, 'export {};');
    expect(resolver.ensureIncludeCache()).toBe(empty);
    resolver.invalidateIncludeCache();
    expect(resolver.ensureIncludeCache()).toEqual([file]);
    rmSync(file);
    resolver.invalidateAll();
    const removed = resolver.ensureIncludeCache();
    expect(removed).toEqual([]);
    expect(resolver.ensureIncludeCache()).toBe(removed);
  });

  it('separates cached production options when source maps are enabled', () => {
    const path = join(workspaceRoot, 'tsconfig.json');
    writeFileSync(
      path,
      JSON.stringify({ files: ['libs/feature/src/pages/index.page.ts'] }),
    );
    const resolver = new TsconfigResolver({
      workspaceRoot,
      include: [],
      liveReload: false,
      isTest: false,
    });
    const config = (sourcemap: boolean | 'hidden') =>
      ({ mode: 'production', build: { sourcemap } }) as ResolvedConfig;
    const withoutMaps = resolver.getCachedTsconfigOptions(path, config(false));
    const withMaps = resolver.getCachedTsconfigOptions(path, config('hidden'));
    expect(withoutMaps.options.sourceMap).toBe(false);
    expect(withMaps.options.sourceMap).toBe(true);
    expect(withMaps.options.inlineSources).toBe(true);
    expect(withMaps).not.toBe(withoutMaps);
    expect(resolver.getCachedTsconfigOptions(path, config(false))).toBe(
      withoutMaps,
    );
  });

  it('includes files matched by analog.setup globs and refreshes when they change', () => {
    const resolver = new TsconfigResolver({
      workspaceRoot,
      include: [],
      liveReload: false,
      isTest: false,
    });

    expect(resolver.ensureIncludeCache()).toEqual([]);

    resolver.setIntegrationIncludes(['/libs/feature/**/*.page.ts']);

    expect(resolver.ensureIncludeCache().map(normalizePath)).toEqual([
      normalizePath(
        join(workspaceRoot, 'libs/feature/src/pages/index.page.ts'),
      ),
    ]);

    resolver.setIntegrationIncludes([]);

    expect(resolver.ensureIncludeCache()).toEqual([]);
  });
});
