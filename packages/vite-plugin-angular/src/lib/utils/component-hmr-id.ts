import ts from 'typescript';

/** Angular uses the compiler host's canonical filenames in HMR identifiers. */
export function componentHmrId(
  relativeFile: string,
  className: string,
  caseSensitive: boolean = ts.sys.useCaseSensitiveFileNames,
): string {
  const file = relativeFile.replaceAll('\\', '/');
  return `${caseSensitive ? file : file.toLowerCase()}@${className}`;
}

/** Recover the actual Vite ID from Angular's case-folded Windows request. */
export function resolveHmrSource(
  files: ReadonlyMap<string, unknown>,
  requested: string,
  caseSensitive: boolean = ts.sys.useCaseSensitiveFileNames,
): string {
  const file = requested.replaceAll('\\', '/');
  if (caseSensitive || files.has(file)) return file;
  const canonical = file.toLowerCase();
  for (const known of files.keys()) {
    if (known.replaceAll('\\', '/').toLowerCase() === canonical) return known;
  }
  return file;
}
