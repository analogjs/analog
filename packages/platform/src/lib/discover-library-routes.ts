import { normalizePath } from 'vite';
import { globSync } from 'tinyglobby';

export interface DiscoveredLibraryRoutes {
  additionalPagesDirs: string[];
  additionalContentDirs: string[];
  additionalAPIDirs: string[];
}

const empty: DiscoveredLibraryRoutes = Object.freeze({
  additionalPagesDirs: Object.freeze([] as string[]),
  additionalContentDirs: Object.freeze([] as string[]),
  additionalAPIDirs: Object.freeze([] as string[]),
});

const discoverableLibRouteDirs = [
  'libs/**/src/pages',
  'libs/**/src/content',
  'libs/**/src/api',
] as const;

function toWorkspacePath(path: string) {
  return normalizePath(path).replace(/\/$/, '');
}

/**
 * Scans workspace libraries directly for conventional route directories
 * (`src/pages`, `src/content`, `src/api`).
 *
 * Returns workspace-relative paths (e.g. `/libs/shared/feature`) suitable
 * for merging into the `additional*Dirs` options.
 */
export function discoverLibraryRoutes(
  workspaceRoot: string,
): DiscoveredLibraryRoutes {
  const result: DiscoveredLibraryRoutes = {
    additionalPagesDirs: [],
    additionalContentDirs: [],
    additionalAPIDirs: [],
  };
  const normalizedWorkspaceRoot = toWorkspacePath(workspaceRoot);
  const discovered = new Map<
    string,
    {
      pages: boolean;
      content: boolean;
      api: boolean;
    }
  >();

  for (const dir of globSync(discoverableLibRouteDirs, {
    cwd: normalizedWorkspaceRoot,
    dot: true,
    onlyDirectories: true,
  })) {
    const normalizedDir = toWorkspacePath(dir);
    const workspaceRelativeDir = normalizedDir.startsWith(
      `${normalizedWorkspaceRoot}/`,
    )
      ? normalizedDir.slice(normalizedWorkspaceRoot.length + 1)
      : normalizedDir;

    if (!workspaceRelativeDir.startsWith('libs/')) {
      continue;
    }

    const srcIndex = workspaceRelativeDir.indexOf('/src/');
    if (srcIndex === -1) {
      continue;
    }

    const libRoot = workspaceRelativeDir.slice(0, srcIndex);
    const entry = discovered.get(libRoot) ?? {
      pages: false,
      content: false,
      api: false,
    };

    if (workspaceRelativeDir.endsWith('/src/pages')) {
      entry.pages = true;
    }

    if (workspaceRelativeDir.endsWith('/src/content')) {
      entry.content = true;
    }

    if (workspaceRelativeDir.endsWith('/src/api')) {
      entry.api = true;
    }

    discovered.set(libRoot, entry);
  }

  for (const libRoot of [...discovered.keys()].sort()) {
    const entry = discovered.get(libRoot)!;

    if (entry.pages) {
      result.additionalPagesDirs.push(`/${libRoot}`);
    }

    if (entry.content) {
      result.additionalContentDirs.push(`/${libRoot}/src/content`);
    }

    if (entry.api) {
      result.additionalAPIDirs.push(`/${libRoot}/src/api`);
    }
  }

  return result;
}
