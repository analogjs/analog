// Virtual module id helpers for external component resources (template and
// style files). Routing through virtual ids keeps Vite's built-in plugins
// (vite:css, vite:asset, the server.fs Denied ID check) out of the picture:
// the id Vite sees has no file extension, so extension-based matchers never
// fire, and it does not match the /[?&](raw|inline)\b/ security regex that
// blocks user-facing ?raw and ?inline queries.
//
// Both prefixes share the same shape — a literal prefix followed by a
// base64url-encoded absolute file path — so load hooks can round-trip back
// to the source file for reading and watching. See #2263 / #2283.

export const VIRTUAL_STYLE_PREFIX =
  'virtual:@analogjs/vite-plugin-angular:inline-style:';

export const VIRTUAL_RAW_PREFIX = 'virtual:@analogjs/vite-plugin-angular:raw:';

function encode(absPath: string): string {
  return Buffer.from(absPath, 'utf-8').toString('base64url');
}

function decode(encoded: string): string {
  return Buffer.from(encoded, 'base64url').toString('utf-8');
}

export function toVirtualStyleId(absPath: string): string {
  return `${VIRTUAL_STYLE_PREFIX}${encode(absPath)}`;
}

export function isVirtualStyleId(id: string): boolean {
  const stripped = id.startsWith('\0') ? id.slice(1) : id;
  return stripped.startsWith(VIRTUAL_STYLE_PREFIX);
}

export function fromVirtualStyleId(id: string): string {
  const normalizedId = id.startsWith('\0') ? id.slice(1) : id;
  if (!normalizedId.startsWith(VIRTUAL_STYLE_PREFIX)) {
    throw new Error(`Invalid virtual style id: ${id}`);
  }
  return decode(normalizedId.slice(VIRTUAL_STYLE_PREFIX.length));
}

export function toVirtualRawId(absPath: string): string {
  return `${VIRTUAL_RAW_PREFIX}${encode(absPath)}`;
}

export function isVirtualRawId(id: string): boolean {
  const stripped = id.startsWith('\0') ? id.slice(1) : id;
  return stripped.startsWith(VIRTUAL_RAW_PREFIX);
}

export function fromVirtualRawId(id: string): string {
  const normalizedId = id.startsWith('\0') ? id.slice(1) : id;
  if (!normalizedId.startsWith(VIRTUAL_RAW_PREFIX)) {
    throw new Error(`Invalid virtual raw id: ${id}`);
  }
  return decode(normalizedId.slice(VIRTUAL_RAW_PREFIX.length));
}
