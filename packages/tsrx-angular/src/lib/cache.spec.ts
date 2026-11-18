import { beforeEach, describe, expect, it, vi } from 'vitest';

const parseModule = vi.hoisted(() => ({ calls: 0 }));

vi.mock('@tsrx/core', async (importOriginal) => {
  const core = await importOriginal<typeof import('@tsrx/core')>();
  return {
    ...core,
    parseModule: (source: string, fileName: string) => {
      parseModule.calls++;
      return core.parseModule(source, fileName);
    },
  };
});

import {
  lowerTsrxForScan,
  lowerTsrxModule,
  tsrxImportSpecifiers,
} from './cache';

let fileCounter = 0;
/** A fresh file name per test so the module-level cache doesn't leak between tests. */
const nextFile = () => `/app/file-${fileCounter++}.tsrx`;

const STANDALONE = `import { signal } from '@angular/core';
export function Counter() @{
  const count = signal(0);
  <button onClick={() => count.update((c) => c + 1)}>{count()}</button>
}
`;

const WITH_IMPORTED_TAG = `import { Badge } from './badge';
export { helper } from './helper';
export function App() @{
  <Badge />
}
`;

describe('TSRX parse and lowering cache', () => {
  beforeEach(() => {
    parseModule.calls = 0;
  });

  it('parses a source once across import discovery, scanning and compiling', async () => {
    const file = nextFile();
    expect(await tsrxImportSpecifiers(WITH_IMPORTED_TAG, file)).toEqual([
      './badge',
      './helper',
    ]);
    await lowerTsrxForScan(WITH_IMPORTED_TAG, file);
    await lowerTsrxModule(WITH_IMPORTED_TAG, file, {
      resolveSelector: () => 'app-badge',
    });
    expect(parseModule.calls).toBe(1);
  });

  it('reuses a scan lowering that resolved no selectors', async () => {
    const file = nextFile();
    const scan = await lowerTsrxForScan(STANDALONE, file);
    const resolveSelector = vi.fn(() => 'unused');
    const compiled = await lowerTsrxModule(STANDALONE, file, {
      resolveSelector,
    });
    expect(compiled).toBe(scan);
    expect(resolveSelector).not.toHaveBeenCalled();
  });

  it('lowers again when imported selectors are involved', async () => {
    const file = nextFile();
    const scan = await lowerTsrxForScan(WITH_IMPORTED_TAG, file);
    expect(scan.code).toContain('<tsrx-unresolved>');

    const first = await lowerTsrxModule(WITH_IMPORTED_TAG, file, {
      resolveSelector: () => 'app-badge',
    });
    expect(first.code).toContain('<app-badge>');

    // An edit to the imported component's selector reaches an unchanged importer.
    const second = await lowerTsrxModule(WITH_IMPORTED_TAG, file, {
      resolveSelector: () => 'app-pill',
    });
    expect(second.code).toContain('<app-pill>');
    expect(parseModule.calls).toBe(1);
  });

  it('serves scans from the latest compile lowering', async () => {
    const file = nextFile();
    const compiled = await lowerTsrxModule(WITH_IMPORTED_TAG, file, {
      resolveSelector: () => 'app-badge',
    });
    expect(await lowerTsrxForScan(WITH_IMPORTED_TAG, file)).toBe(compiled);
  });

  it('parses again when the source changes', async () => {
    const file = nextFile();
    await lowerTsrxForScan(STANDALONE, file);
    await lowerTsrxForScan(STANDALONE.replace('signal(0)', 'signal(1)'), file);
    expect(parseModule.calls).toBe(2);
  });

  it('caches parse errors too', async () => {
    const file = nextFile();
    const broken = 'export function C() @{\n  <div>\n}\n';
    expect(await tsrxImportSpecifiers(broken, file)).toEqual([]);
    const result = await lowerTsrxForScan(broken, file);
    expect(result.diagnostics.length).toBe(1);
    expect(parseModule.calls).toBe(1);
  });
});
