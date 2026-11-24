import type { Tree } from '@angular-devkit/schematics';

export interface Edit {
  start: number;
  end: number;
  text: string;
}

export function applyEdits(source: string, edits: Edit[]): string {
  // Apply right-to-left so earlier offsets stay valid.
  const sorted = [...edits].sort((a, b) => b.start - a.start);
  let result = source;
  for (const edit of sorted) {
    result = result.slice(0, edit.start) + edit.text + result.slice(edit.end);
  }
  return result;
}

const SOURCE_EXTENSIONS = ['.ts', '.mts', '.cts', '.tsx'];

/** Rewrites workspace TypeScript sources that contain `marker`. */
export function rewriteSourceFiles(
  tree: Tree,
  marker: string,
  rewrite: (filePath: string, source: string) => string | null,
): string[] {
  const rewritten: string[] = [];
  tree.visit((filePath) => {
    if (filePath.includes('/node_modules/')) return;
    if (!SOURCE_EXTENSIONS.some((ext) => filePath.endsWith(ext))) return;

    const source = tree.read(filePath)?.toString('utf-8');
    if (!source?.includes(marker)) return;

    const result = rewrite(filePath, source);
    if (result !== null && result !== source) {
      tree.overwrite(filePath, result);
      rewritten.push(filePath);
    }
  });
  return rewritten;
}
