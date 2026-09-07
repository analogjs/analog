import { dirname, resolve } from 'node:path';
import { normalizePath } from 'vite';

export const TS_EXT_REGEX: RegExp = /\.[cm]?ts(?![a-z])/;

// Vite before 6.3 ignores hook filters. Keep the same guard in each handler.
export function isCompilerSource(id: string): boolean {
  return (
    TS_EXT_REGEX.test(id) &&
    !id.includes('node_modules') &&
    !id.includes('type=script') &&
    !id.includes('@ng/component') &&
    !/[?&]raw\b/.test(id)
  );
}

/** Keep request queries separate from filesystem identities. */
export function splitQuery(id: string): readonly [path: string, query: string] {
  const separator = id.indexOf('?');
  return separator < 0
    ? [id, '']
    : [id.slice(0, separator), id.slice(separator + 1)];
}

export function stripQuery(id: string): string {
  return splitQuery(id)[0];
}

export function resolveJitResource(
  id: string,
  importer: string | undefined,
): string {
  const separator = id.indexOf(';');
  if (!importer || separator < 0 || separator === id.length - 1) {
    throw new Error(`Invalid Angular JIT resource request: ${id}`);
  }
  return normalizePath(resolve(dirname(importer), id.slice(separator + 1)));
}

export function splitComponentId(
  id: string,
): readonly [file: string, className: string] {
  const decoded = decodeURIComponent(id);
  const separator = decoded.lastIndexOf('@');
  return separator < 0
    ? [decoded, '']
    : [decoded.slice(0, separator), decoded.slice(separator + 1)];
}
