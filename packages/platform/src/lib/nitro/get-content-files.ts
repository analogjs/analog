import { readFileSync } from 'node:fs';
import { basename, join, relative, resolve } from 'node:path';
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

    // Split the basename on the LAST dot so file names that contain
    // additional dots (e.g. locale suffixes like `post.en.md`) keep the
    // inner dots in `name` and only the trailing segment becomes the
    // extension. The previous regex stopped at the first dot and
    // discarded everything between it and the extension.
    const filename = basename(normalizePath(f));
    const dot = filename.lastIndexOf('.');
    const name = dot === -1 ? filename : filename.slice(0, dot);
    const extension = dot === -1 ? '' : filename.slice(dot + 1);

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
