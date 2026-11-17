import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { normalizePath } from 'vite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { findFastCompileApi, type FastCompileApi } from './fast-compile-api';
import { fastCompilePlugin } from './fast-compile-plugin';

function buildPlugin() {
  return fastCompilePlugin({
    tsconfigGetter: () => 'tsconfig.json',
    workspaceRoot: '/workspace',
    inlineStylesExtension: 'css',
    jit: false,
    liveReload: false,
    isTest: false,
    isAstroIntegration: false,
  });
}

/** A source format whose modules are already TypeScript, for testing the seam. */
const customFormat = {
  name: 'custom',
  test: (path: string) => path.endsWith('.custom'),
  toScanSource: (code: string) => code,
};

describe('fast compile API', () => {
  let api: FastCompileApi;
  let dir: string;

  beforeEach(() => {
    api = findFastCompileApi([{}, buildPlugin()])!;
    dir = normalizePath(mkdtempSync(join(tmpdir(), 'fast-compile-api-')));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('is found among Vite plugins', () => {
    expect(api).toBeDefined();
    expect(findFastCompileApi([{}, { api: {} }])).toBeUndefined();
  });

  it('compiles TypeScript produced for a module of another format', async () => {
    const mapToSource = vi.fn((map) => ({
      ...(typeof map === 'string' ? JSON.parse(map) : map),
      sources: ['counter.custom'],
    }));
    const result = await api.compile(
      `import { Component } from '@angular/core';
@Component({ selector: 'app-counter', template: '<p>count</p>' })
export class Counter {}
`,
      `${dir}/counter.custom`,
      { resolve: async () => null, mapToSource },
    );

    expect(result?.code).toContain('ɵɵdefineComponent');
    expect(result?.code).not.toContain('@Component');
    expect(mapToSource).toHaveBeenCalledOnce();
    expect(result?.map).toMatchObject({ sources: ['counter.custom'] });
  });

  it('scans modules of a registered format into the component registry', async () => {
    api.registerSourceFormat(customFormat);
    const badge = `${dir}/badge.custom`;
    writeFileSync(
      badge,
      `import { Component } from '@angular/core';
@Component({ selector: 'x-badge', template: '' })
export class Badge {}
`,
    );

    expect(api.resolveSelector('Badge')).toBeNull();
    await api.scanImports(
      ['./badge.custom'],
      `${dir}/app.custom`,
      async () => ({
        id: badge,
      }),
    );
    expect(api.resolveSelector('Badge')).toBe('x-badge');
  });

  it('ignores imports of unregistered formats', async () => {
    const other = `${dir}/other.unknown`;
    writeFileSync(
      other,
      `import { Component } from '@angular/core';
@Component({ selector: 'x-other', template: '' })
export class Other {}
`,
    );
    await api.scanImports(
      ['./other.unknown'],
      `${dir}/app.custom`,
      async () => ({
        id: other,
      }),
    );
    expect(api.resolveSelector('Other')).toBeNull();
  });
});
