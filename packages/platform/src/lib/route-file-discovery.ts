import { normalizePath } from 'vite';
import { resolve } from 'node:path';
import { globSync } from 'tinyglobby';

export interface RouteFileDiscoveryOptions {
  root: string;
  workspaceRoot: string;
  additionalPagesDirs: string[];
  additionalContentDirs: string[];
}

export interface RouteFileDiscovery {
  getRouteFiles(): string[];
  getContentFiles(): string[];
  getDiscoveredFileKind(path: string): 'route' | 'content' | null;
  updateDiscoveredFile(path: string, event: 'add' | 'change' | 'unlink'): void;
  /**
   * Returns true if the normalized filename was discovered from an app-local
   * glob (under the configured root) rather than from an additional directory.
   *
   * Used by collision priority to prefer app-local routes over shared/external
   * routes based on actual configured roots instead of hard-coded path
   * substrings.
   */
  isAppLocal(normalizedFilename: string): boolean;
  reset(): void;
}

export function createRouteFileDiscovery(
  options: RouteFileDiscoveryOptions,
): RouteFileDiscovery {
  const { root, workspaceRoot, additionalPagesDirs, additionalContentDirs } =
    options;

  let routeFilesCache = new Set<string>();
  let contentFilesCache = new Set<string>();
  let appLocalFilesCache = new Set<string>();
  let initialized = false;
  const joinDir = (dir: string) =>
    dir.startsWith(workspaceRoot)
      ? normalizePath(dir)
      : dir.startsWith('/')
        ? normalizePath(`${workspaceRoot}${dir}`)
        : normalizePath(resolve(workspaceRoot, dir));
  const additionalPagesRoots = additionalPagesDirs.map(joinDir);
  const additionalContentRoots = additionalContentDirs.map(joinDir);

  function normalizePath_(absolutePath: string): string {
    const normalized = normalizePath(absolutePath);
    if (normalized.startsWith(root)) {
      return normalized.slice(root.length);
    }
    if (normalized.startsWith(workspaceRoot)) {
      return normalized.slice(workspaceRoot.length);
    }
    return normalized;
  }

  function isWithinDir(path: string, dir: string): boolean {
    return path === dir || path.startsWith(`${dir}/`);
  }

  function getDiscoveredFileKind(path: string): 'route' | 'content' | null {
    const normalized = normalizePath(path);

    if (
      normalized.endsWith('.md') &&
      (normalized.includes('/src/app/routes/') ||
        normalized.includes('/src/app/pages/') ||
        normalized.includes('/src/content/') ||
        additionalContentRoots.some((dir) => isWithinDir(normalized, dir)))
    ) {
      return 'content';
    }

    if (
      (normalized.includes('/app/routes/') ||
        normalized.includes('/src/app/routes/')) &&
      normalized.endsWith('.ts')
    ) {
      return 'route';
    }

    // Keep the dev watcher aligned with the build-time route scan. In
    // particular, `src/server/routes/**` must stay out of typed route codegen
    // because Nitro API handlers are not client-navigable pages.
    if (
      normalized.endsWith('.page.ts') &&
      (normalized.includes('/src/app/pages/') ||
        additionalPagesRoots.some((dir) => isWithinDir(normalized, dir)))
    ) {
      return 'route';
    }

    return null;
  }

  function scanRouteFiles(): string[] {
    const appLocalGlobs = [
      `${root}/app/routes/**/*.ts`,
      `${root}/src/app/routes/**/*.ts`,
      `${root}/src/app/pages/**/*.page.ts`,
    ];
    const additionalGlobs = additionalPagesDirs.map(
      (dir) => `${joinDir(dir)}/**/*.page.ts`,
    );

    const appLocal = globSync(appLocalGlobs, {
      dot: true,
      absolute: true,
    }).map(normalizePath_);

    const additional = globSync(additionalGlobs, {
      dot: true,
      absolute: true,
    }).map(normalizePath_);

    for (const f of appLocal) {
      appLocalFilesCache.add(f);
    }

    return [...appLocal, ...additional];
  }

  function scanContentFiles(): string[] {
    const appLocalGlobs = [
      `${root}/src/app/routes/**/*.md`,
      `${root}/src/app/pages/**/*.md`,
      `${root}/src/content/**/*.md`,
    ];
    const additionalGlobs = additionalContentDirs.map(
      (dir) => `${joinDir(dir)}/**/*.md`,
    );

    const appLocal = globSync(appLocalGlobs, {
      dot: true,
      absolute: true,
    }).map(normalizePath_);

    const additional = globSync(additionalGlobs, {
      dot: true,
      absolute: true,
    }).map(normalizePath_);

    for (const f of appLocal) {
      appLocalFilesCache.add(f);
    }

    return [...appLocal, ...additional];
  }

  function isAppLocalByPath(absolutePath: string): boolean {
    const normalized = normalizePath(absolutePath);
    return normalized.startsWith(root);
  }

  function ensureInitialized(): void {
    if (initialized) {
      return;
    }

    routeFilesCache = new Set(scanRouteFiles());
    contentFilesCache = new Set(scanContentFiles());
    initialized = true;
  }

  return {
    getRouteFiles(): string[] {
      ensureInitialized();
      return [...routeFilesCache].sort();
    },

    getContentFiles(): string[] {
      ensureInitialized();
      return [...contentFilesCache].sort();
    },

    getDiscoveredFileKind(path: string): 'route' | 'content' | null {
      return getDiscoveredFileKind(path);
    },

    updateDiscoveredFile(
      path: string,
      event: 'add' | 'change' | 'unlink',
    ): void {
      ensureInitialized();
      const kind = getDiscoveredFileKind(path);
      if (!kind) {
        return;
      }

      const normalizedPath = normalizePath_(path);
      const targetCache =
        kind === 'content' ? contentFilesCache : routeFilesCache;

      if (event === 'unlink') {
        targetCache.delete(normalizedPath);
        appLocalFilesCache.delete(normalizedPath);
        return;
      }

      targetCache.add(normalizedPath);
      if (isAppLocalByPath(path)) {
        appLocalFilesCache.add(normalizedPath);
      }
    },

    isAppLocal(normalizedFilename: string): boolean {
      ensureInitialized();
      return appLocalFilesCache.has(normalizedFilename);
    },

    reset(): void {
      initialized = false;
      appLocalFilesCache = new Set<string>();
    },
  };
}
