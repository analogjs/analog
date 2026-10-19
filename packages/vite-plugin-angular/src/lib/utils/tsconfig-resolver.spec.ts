import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { normalizePath } from 'vite';
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
