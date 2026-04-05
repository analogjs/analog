import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}));

import { existsSync, readFileSync } from 'node:fs';
import { discoverLibraryRoutes } from './discover-library-routes.js';

const mockExistsSync = vi.mocked(existsSync);
const mockReadFileSync = vi.mocked(readFileSync);

function mockTsconfig(paths: Record<string, string[]>) {
  mockReadFileSync.mockReturnValue(
    JSON.stringify({ compilerOptions: { paths } }),
  );
  // tsconfig.base.json exists
  mockExistsSync.mockImplementation((p) => {
    if (String(p).endsWith('tsconfig.base.json')) return true;
    return false;
  });
}

describe('discoverLibraryRoutes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('discovers pages, content, and api dirs from tsconfig paths', () => {
    mockReadFileSync.mockReturnValue(
      JSON.stringify({
        compilerOptions: {
          paths: {
            'shared/feature': ['./libs/shared/feature/src/index.ts'],
          },
        },
      }),
    );
    mockExistsSync.mockReturnValue(true);

    const result = discoverLibraryRoutes('/workspace');

    expect(result.additionalPagesDirs).toEqual(['/libs/shared/feature']);
    expect(result.additionalContentDirs).toEqual([
      '/libs/shared/feature/src/content',
    ]);
    expect(result.additionalAPIDirs).toEqual(['/libs/shared/feature/src/api']);
  });

  it('skips @analogjs/* framework packages', () => {
    mockTsconfig({
      '@analogjs/router': ['./packages/router/src/index.ts'],
      '@analogjs/content': ['./packages/content/src/index.ts'],
      'shared/feature': ['./libs/shared/feature/src/index.ts'],
    });
    // Only the shared/feature pages dir exists
    mockExistsSync.mockImplementation((p) => {
      const s = String(p);
      if (s.endsWith('tsconfig.base.json')) return true;
      if (s.includes('shared/feature') && s.endsWith('src/pages')) return true;
      return false;
    });

    const result = discoverLibraryRoutes('/workspace');

    expect(result.additionalPagesDirs).toEqual(['/libs/shared/feature']);
    expect(result.additionalContentDirs).toEqual([]);
    expect(result.additionalAPIDirs).toEqual([]);
  });

  it('skips libs without route directories', () => {
    mockTsconfig({
      'libs/card': ['./libs/card/src/index.ts'],
    });
    // card has no pages/content/api dirs
    mockExistsSync.mockImplementation((p) => {
      if (String(p).endsWith('tsconfig.base.json')) return true;
      return false;
    });

    const result = discoverLibraryRoutes('/workspace');

    expect(result.additionalPagesDirs).toEqual([]);
    expect(result.additionalContentDirs).toEqual([]);
    expect(result.additionalAPIDirs).toEqual([]);
  });

  it('returns empty arrays when tsconfig is missing', () => {
    mockReadFileSync.mockImplementation(() => {
      throw new Error('ENOENT');
    });
    mockExistsSync.mockReturnValue(false);

    const result = discoverLibraryRoutes('/workspace');

    expect(result).toEqual({
      additionalPagesDirs: [],
      additionalContentDirs: [],
      additionalAPIDirs: [],
    });
  });

  it('returns empty arrays for malformed JSON', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue('not valid json {{{');

    const result = discoverLibraryRoutes('/workspace');

    expect(result).toEqual({
      additionalPagesDirs: [],
      additionalContentDirs: [],
      additionalAPIDirs: [],
    });
  });

  it('handles nested lib paths', () => {
    mockTsconfig({
      'shared/feature': ['./libs/shared/feature/src/index.ts'],
    });
    mockExistsSync.mockImplementation((p) => {
      const s = String(p);
      if (s.endsWith('tsconfig.base.json')) return true;
      if (s.endsWith('shared/feature/src/pages')) return true;
      return false;
    });

    const result = discoverLibraryRoutes('/workspace');

    expect(result.additionalPagesDirs).toEqual(['/libs/shared/feature']);
  });

  it('deduplicates subpath entries for the same lib', () => {
    mockTsconfig({
      'my-lib': ['./libs/my-lib/src/index.ts'],
      'my-lib/testing': ['./libs/my-lib/src/testing/index.ts'],
    });
    mockExistsSync.mockImplementation((p) => {
      const s = String(p);
      if (s.endsWith('tsconfig.base.json')) return true;
      if (s.endsWith('my-lib/src/pages')) return true;
      return false;
    });

    const result = discoverLibraryRoutes('/workspace');

    expect(result.additionalPagesDirs).toEqual(['/libs/my-lib']);
  });

  it('only detects existing subdirectories', () => {
    mockTsconfig({
      'shared/feature': ['./libs/shared/feature/src/index.ts'],
    });
    mockExistsSync.mockImplementation((p) => {
      const s = String(p);
      if (s.endsWith('tsconfig.base.json')) return true;
      // only content exists, no pages or api
      if (s.endsWith('shared/feature/src/content')) return true;
      return false;
    });

    const result = discoverLibraryRoutes('/workspace');

    expect(result.additionalPagesDirs).toEqual([]);
    expect(result.additionalContentDirs).toEqual([
      '/libs/shared/feature/src/content',
    ]);
    expect(result.additionalAPIDirs).toEqual([]);
  });

  it('falls back to tsconfig.json when tsconfig.base.json is missing', () => {
    mockExistsSync.mockImplementation((p) => {
      const s = String(p);
      // tsconfig.base.json does NOT exist
      if (s.endsWith('tsconfig.base.json')) return false;
      if (s.endsWith('my-lib/src/pages')) return true;
      return false;
    });
    mockReadFileSync.mockImplementation((p) => {
      if (String(p).endsWith('tsconfig.base.json')) {
        throw new Error('ENOENT');
      }
      return JSON.stringify({
        compilerOptions: {
          paths: { 'my-lib': ['./libs/my-lib/src/index.ts'] },
        },
      });
    });

    const result = discoverLibraryRoutes('/workspace');

    expect(result.additionalPagesDirs).toEqual(['/libs/my-lib']);
  });

  it('skips paths that do not resolve into libs/', () => {
    mockTsconfig({
      'my-app': ['./apps/my-app/src/index.ts'],
      'some-tool': ['./tools/some-tool/src/index.ts'],
    });

    const result = discoverLibraryRoutes('/workspace');

    expect(result.additionalPagesDirs).toEqual([]);
    expect(result.additionalContentDirs).toEqual([]);
    expect(result.additionalAPIDirs).toEqual([]);
  });
});
