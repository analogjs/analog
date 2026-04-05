import { describe, expect, it } from 'vitest';

import { createRouteFileDiscovery } from './route-file-discovery.js';

describe('createRouteFileDiscovery', () => {
  const discovery = createRouteFileDiscovery({
    root: '/workspace/apps/analog-app',
    workspaceRoot: '/workspace',
    additionalPagesDirs: ['/libs/shared/feature/src/pages'],
    additionalContentDirs: ['/libs/shared/feature/src/content'],
  });

  it('excludes Nitro API routes from typed route tracking', () => {
    expect(
      discovery.getDiscoveredFileKind(
        '/workspace/apps/analog-app/src/server/routes/api/v1/products.ts',
      ),
    ).toBeNull();
  });

  it('tracks app and additional page files as routes', () => {
    expect(
      discovery.getDiscoveredFileKind(
        '/workspace/apps/analog-app/src/app/pages/about.page.ts',
      ),
    ).toBe('route');

    expect(
      discovery.getDiscoveredFileKind(
        '/workspace/libs/shared/feature/src/pages/blog/[slug].page.ts',
      ),
    ).toBe('route');
  });

  it('tracks app and additional markdown files as content', () => {
    expect(
      discovery.getDiscoveredFileKind(
        '/workspace/apps/analog-app/src/content/post.md',
      ),
    ).toBe('content');

    expect(
      discovery.getDiscoveredFileKind(
        '/workspace/libs/shared/feature/src/content/post.md',
      ),
    ).toBe('content');
  });

  it('classifies app-local files via isAppLocal after updateDiscoveredFile', () => {
    const localDiscovery = createRouteFileDiscovery({
      root: '/workspace/apps/analog-app',
      workspaceRoot: '/workspace',
      additionalPagesDirs: ['/libs/shared/feature/src/pages'],
      additionalContentDirs: [],
    });

    localDiscovery.updateDiscoveredFile(
      '/workspace/apps/analog-app/src/app/pages/about.page.ts',
      'add',
    );
    localDiscovery.updateDiscoveredFile(
      '/workspace/libs/shared/feature/src/pages/blog/[slug].page.ts',
      'add',
    );

    expect(localDiscovery.isAppLocal('/src/app/pages/about.page.ts')).toBe(
      true,
    );
    expect(
      localDiscovery.isAppLocal(
        '/libs/shared/feature/src/pages/blog/[slug].page.ts',
      ),
    ).toBe(false);
  });

  it('accepts already-normalized additional directories without re-prefixing workspaceRoot', () => {
    const normalizedDiscovery = createRouteFileDiscovery({
      root: '/workspace/apps/analog-app',
      workspaceRoot: '/workspace',
      additionalPagesDirs: ['/workspace/libs/shared/feature/src/pages'],
      additionalContentDirs: ['/workspace/libs/shared/feature/src/content'],
    });

    expect(
      normalizedDiscovery.getDiscoveredFileKind(
        '/workspace/libs/shared/feature/src/pages/blog/[slug].page.ts',
      ),
    ).toBe('route');
    expect(
      normalizedDiscovery.getDiscoveredFileKind(
        '/workspace/libs/shared/feature/src/content/post.md',
      ),
    ).toBe('content');
  });
});
