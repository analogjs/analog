import * as fs from 'fs';
import * as path from 'path';
import { normalizePath } from 'vite';

import { PrerenderContentFile } from '../options';

export function getMatchingContentFilesWithFrontMatter(
  workspaceRoot: string,
  rootDir: string,
  glob: string
): PrerenderContentFile[] {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const fg = require('fast-glob');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const fm = require('front-matter');
  const root = normalizePath(path.resolve(workspaceRoot, rootDir));

  const resolvedDir = normalizePath(path.resolve(root, glob));
  const contentFiles: string[] = fg.sync([`${root}/${resolvedDir}/*`], {
    dot: true,
  });

  const mappedFilesWithFm: PrerenderContentFile[] = contentFiles.map((f) => {
    const fileContents = fs.readFileSync(f, 'utf8');
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
