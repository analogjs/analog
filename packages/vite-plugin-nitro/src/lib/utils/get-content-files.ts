import { readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { normalizePath } from 'vite';
import { createRequire } from 'node:module';

import { PrerenderContentFile } from '../options';

const require = createRequire(import.meta.url);

export function getMatchingContentFilesWithFrontMatter(
  workspaceRoot: string,
  rootDir: string,
  glob: string
): PrerenderContentFile[] {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const fg = require('fast-glob');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const fm = require('front-matter');
  const root = normalizePath(resolve(workspaceRoot, rootDir));

  const resolvedDir = normalizePath(relative(root, join(root, glob)));
  const contentFiles: string[] = fg.sync([`${root}/${resolvedDir}/*`], {
    dot: true,
  });

  const mappedFilesWithFm: PrerenderContentFile[] = contentFiles.map((f) => {
    const fileContents = readFileSync(f, 'utf8');
    const raw = fm(fileContents);
    const filepath = f.replace(root, '');

    const match = filepath.match(/\/([^/.]+)(\.([^/.]+))?$/);
    let name = '';
    let extension = '';
    if (match) {
      name = match[1];
      extension = match[3] || ''; // Using an empty string if there's no extension
    }

    return {
      name,
      extension,
      path: resolvedDir,
      attributes: raw.attributes as { attributes: Record<string, any> },
    };
  });

  return mappedFilesWithFm;
}
