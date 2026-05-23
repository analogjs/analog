import { readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { normalizePath } from 'vite';
import { createRequire } from 'node:module';
import { globSync } from 'tinyglobby';

import type { PrerenderContentFile } from './types.js';

const require = createRequire(import.meta.url);

/**
 * Discovers content files with front matter and extracts metadata for prerendering.
 *
 * Globs the resolved content directory, reads each match, parses YAML/TOML
 * front matter via `front-matter`, and returns `PrerenderContentFile`
 * entries used by `PrerenderContentDir.transform()` to map files to routes.
 *
 * When `recursive` is enabled, `relativePath` on each result captures the
 * file's directory relative to `contentDir` so transforms can disambiguate
 * identically-named files across subdirectories.
 */
export function getMatchingContentFilesWithFrontMatter(
  workspaceRoot: string,
  rootDir: string,
  glob: string,
  recursive = false,
): PrerenderContentFile[] {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const fm = require('front-matter');

  const root = normalizePath(resolve(workspaceRoot, rootDir));
  const resolvedDir = normalizePath(relative(root, join(root, glob)));

  const pattern = recursive
    ? `${root}/${resolvedDir}/**/*`
    : `${root}/${resolvedDir}/*`;
  const contentFiles: string[] = globSync([pattern], {
    dot: true,
    absolute: true,
    onlyFiles: true,
  });

  const dirPrefix = `${root}/${resolvedDir}`;

  const mappedFilesWithFm: PrerenderContentFile[] = contentFiles.map((f) => {
    const fileContents = readFileSync(f, 'utf8');
    const raw = fm(fileContents);

    const filepath = normalizePath(f).replace(root, '');
    const match = filepath.match(/\/([^/.]+)(\.([^/.]+))?$/);
    let name = '';
    let extension = '';
    if (match) {
      name = match[1];
      extension = match[3] || '';
    }

    const relativeDir = normalizePath(relative(dirPrefix, f));
    const lastSlash = relativeDir.lastIndexOf('/');
    const relativePath =
      lastSlash === -1 ? '' : relativeDir.slice(0, lastSlash);

    return {
      name,
      extension,
      path: resolvedDir,
      attributes: raw.attributes as { attributes: Record<string, any> },
      content: fileContents,
      relativePath,
    };
  });

  return mappedFilesWithFm;
}
