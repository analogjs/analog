import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import Module from 'node:module';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { loadPackage } from './add-angular-app';

describe('loadPackage', () => {
  const originalNodePath = process.env['NODE_PATH'];
  const tempDirs: string[] = [];

  afterEach(() => {
    if (originalNodePath === undefined) {
      delete process.env['NODE_PATH'];
    } else {
      process.env['NODE_PATH'] = originalNodePath;
    }
    (Module as unknown as { _initPaths: () => void })._initPaths();
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('resolves a package exposed only via NODE_PATH (Nx ensurePackage)', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'analog-ensure-pkg-'));
    tempDirs.push(tempDir);

    const pkgDir = join(tempDir, 'node_modules', '@analog-test', 'ensured-pkg');
    mkdirSync(pkgDir, { recursive: true });
    writeFileSync(
      join(pkgDir, 'package.json'),
      JSON.stringify({
        name: '@analog-test/ensured-pkg',
        version: '1.0.0',
        exports: { './generators': './generators.js' },
      }),
    );
    writeFileSync(
      join(pkgDir, 'generators.js'),
      'module.exports = { marker: "loaded-via-node-path" };\n',
    );

    const nodeModulesDir = join(tempDir, 'node_modules');
    process.env['NODE_PATH'] = originalNodePath
      ? `${nodeModulesDir}${delimiter}${originalNodePath}`
      : nodeModulesDir;
    (Module as unknown as { _initPaths: () => void })._initPaths();

    const mod = await loadPackage<{ marker: string }>(
      '@analog-test/ensured-pkg/generators',
    );
    expect(mod.marker).toBe('loaded-via-node-path');
  });

  it('rethrows the original error when neither ESM nor CJS can resolve', async () => {
    await expect(
      loadPackage('@analog-test/definitely-does-not-exist/generators'),
    ).rejects.toThrow();
  });
});
