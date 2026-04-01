import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface DiscoveredLibraryRoutes {
  additionalPagesDirs: string[];
  additionalContentDirs: string[];
  additionalAPIDirs: string[];
}

const empty: DiscoveredLibraryRoutes = {
  additionalPagesDirs: [],
  additionalContentDirs: [],
  additionalAPIDirs: [],
};

/**
 * Reads `tsconfig.base.json` (or `tsconfig.json`) path aliases from the
 * workspace root and checks each library for conventional route directories
 * (`src/pages`, `src/content`, `src/api`).
 *
 * Returns workspace-relative paths (e.g. `/libs/shared/feature`) suitable
 * for merging into the `additional*Dirs` options.
 */
export function discoverLibraryRoutes(
  workspaceRoot: string,
): DiscoveredLibraryRoutes {
  let raw: string;
  try {
    const basePath = join(workspaceRoot, 'tsconfig.base.json');
    const fallbackPath = join(workspaceRoot, 'tsconfig.json');
    raw = existsSync(basePath)
      ? readFileSync(basePath, 'utf-8')
      : readFileSync(fallbackPath, 'utf-8');
  } catch {
    return empty;
  }

  let paths: Record<string, string[]>;
  try {
    const tsconfig = JSON.parse(raw);
    paths = tsconfig?.compilerOptions?.paths ?? {};
  } catch {
    return empty;
  }

  const result: DiscoveredLibraryRoutes = {
    additionalPagesDirs: [],
    additionalContentDirs: [],
    additionalAPIDirs: [],
  };
  const seen = new Set<string>();

  for (const [alias, targets] of Object.entries(paths)) {
    if (alias.startsWith('@analogjs/')) {
      continue;
    }

    const target = targets?.[0];
    if (!target) {
      continue;
    }

    const normalized = target.startsWith('./') ? target.slice(2) : target;

    if (!normalized.startsWith('libs/')) {
      continue;
    }

    const srcIndex = normalized.indexOf('/src/');
    if (srcIndex === -1) {
      continue;
    }

    const libRoot = normalized.slice(0, srcIndex);

    if (seen.has(libRoot)) {
      continue;
    }
    seen.add(libRoot);

    const absoluteLibRoot = join(workspaceRoot, libRoot);

    if (existsSync(join(absoluteLibRoot, 'src/pages'))) {
      result.additionalPagesDirs.push(`/${libRoot}`);
    }

    if (existsSync(join(absoluteLibRoot, 'src/content'))) {
      result.additionalContentDirs.push(`/${libRoot}/src/content`);
    }

    if (existsSync(join(absoluteLibRoot, 'src/api'))) {
      result.additionalAPIDirs.push(`/${libRoot}/src/api`);
    }
  }

  return result;
}
