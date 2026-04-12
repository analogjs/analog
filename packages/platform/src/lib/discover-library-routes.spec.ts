import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('tinyglobby', () => ({
  globSync: vi.fn(() => []),
}));

import { globSync } from 'tinyglobby';
import { discoverLibraryRoutes } from './discover-library-routes.js';

const mockGlobSync = vi.mocked(globSync);

describe('discoverLibraryRoutes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('discovers pages, content, and api dirs from workspace libraries', () => {
    mockGlobSync.mockReturnValue([
      'libs/shared/feature/src/pages',
      'libs/shared/feature/src/content',
      'libs/shared/feature/src/api',
    ]);

    const result = discoverLibraryRoutes('/workspace');

    expect(mockGlobSync).toHaveBeenCalledWith(
      ['libs/**/src/pages', 'libs/**/src/content', 'libs/**/src/api'],
      expect.objectContaining({
        cwd: '/workspace',
        dot: true,
        onlyDirectories: true,
      }),
    );
    expect(result).toEqual({
      additionalPagesDirs: ['/libs/shared/feature'],
      additionalContentDirs: ['/libs/shared/feature/src/content'],
      additionalAPIDirs: ['/libs/shared/feature/src/api'],
    });
  });

  it('deduplicates multiple discovered dirs from the same library', () => {
    mockGlobSync.mockReturnValue([
      'libs/shared/feature/src/content',
      'libs/shared/feature/src/pages',
      'libs/shared/feature/src/api',
      'libs/shared/feature/src/pages',
    ]);

    const result = discoverLibraryRoutes('/workspace');

    expect(result.additionalPagesDirs).toEqual(['/libs/shared/feature']);
    expect(result.additionalContentDirs).toEqual([
      '/libs/shared/feature/src/content',
    ]);
    expect(result.additionalAPIDirs).toEqual(['/libs/shared/feature/src/api']);
  });

  it('sorts discovered libraries deterministically', () => {
    mockGlobSync.mockReturnValue([
      'libs/z-last/src/pages',
      'libs/a-first/src/content',
      'libs/m-middle/src/api',
      'libs/a-first/src/pages',
    ]);

    const result = discoverLibraryRoutes('/workspace');

    expect(result.additionalPagesDirs).toEqual([
      '/libs/a-first',
      '/libs/z-last',
    ]);
    expect(result.additionalContentDirs).toEqual(['/libs/a-first/src/content']);
    expect(result.additionalAPIDirs).toEqual(['/libs/m-middle/src/api']);
  });

  it('returns empty arrays when no workspace libraries match', () => {
    mockGlobSync.mockReturnValue([]);

    const result = discoverLibraryRoutes('/workspace');

    expect(result).toEqual({
      additionalPagesDirs: [],
      additionalContentDirs: [],
      additionalAPIDirs: [],
    });
  });

  it('normalizes workspace-relative and absolute-looking glob results', () => {
    mockGlobSync.mockReturnValue([
      '/workspace/libs/shared/feature/src/pages/',
      '/workspace/libs/shared/feature/src/content/',
    ]);

    const result = discoverLibraryRoutes('/workspace/');

    expect(result.additionalPagesDirs).toEqual(['/libs/shared/feature']);
    expect(result.additionalContentDirs).toEqual([
      '/libs/shared/feature/src/content',
    ]);
  });
});
