// Virtual module id helpers for external component resources (template files).
// Routing through virtual ids keeps Vite's built-in plugins (vite:asset, the
// server.fs Denied ID check) out of the picture: the id Vite sees has no
// file extension, so extension-based matchers never fire, and it does not
// match the /[?&](raw|inline)\b/ security regex.
//
// Style ?inline imports now flow through Vite's native CSS pipeline via
// safeModulePaths (see safe-module-paths.ts). Only template ?raw imports
// still use virtual ids. See #2263 / #2283 / #2310.

export const VIRTUAL_RAW_PREFIX = 'virtual:@analogjs/vite-plugin-angular:raw:';

function encode(absPath: string): string {
  return Buffer.from(absPath, 'utf-8').toString('base64url');
}

function decode(encoded: string): string {
  return Buffer.from(encoded, 'base64url').toString('utf-8');
}

export function toVirtualRawId(absPath: string): string {
  return `${VIRTUAL_RAW_PREFIX}${encode(absPath)}`;
}

export function isVirtualRawId(id: string): boolean {
  return id.replace(/^\0/, '').startsWith(VIRTUAL_RAW_PREFIX);
}

export function fromVirtualRawId(id: string): string {
  const normalizedId = id.replace(/^\0/, '');
  if (!normalizedId.startsWith(VIRTUAL_RAW_PREFIX)) {
    throw new Error(`Invalid virtual raw id: ${id}`);
  }
  return decode(normalizedId.slice(VIRTUAL_RAW_PREFIX.length));
}
