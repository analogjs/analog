import { extname } from 'node:path';

/**
 * Request prefix used in source code (import statements).
 * Does NOT include the \0 virtual-module marker because \0 is
 * invalid inside import specifiers — Vite's import-analysis
 * plugin strips it and then cannot resolve the remaining path.
 */
const ANALOG_INLINE_REQUEST = 'analog-inline:';

/**
 * Resolved prefix returned from resolveId.  The \0 marks it as
 * a Rollup virtual module so other plugins (including vite:css)
 * skip it.
 */
const ANALOG_INLINE_RESOLVED = '\0analog-inline:';

/**
 * Build an import specifier for use in transformed source code.
 * The stylesheet extension is moved into the prefix so the final
 * specifier does not end with a CSS extension — this prevents
 * Vite's vite:css plugin (cssLangRE) from matching.
 *
 * Format: analog-inline:scss:/absolute/path/to/foo.component
 */
export function toAnalogInlineRequest(filePath: string): string {
  const ext = extname(filePath).slice(1);
  const base = filePath.slice(0, -(ext.length + 1));
  return `${ANALOG_INLINE_REQUEST}${ext}:${base}`;
}

/**
 * If `id` is an analog-inline request (emitted by the transform
 * hook), return the \0-prefixed resolved virtual module ID.
 */
export function resolveAnalogInlineId(id: string): string | undefined {
  if (!id.startsWith(ANALOG_INLINE_REQUEST)) {
    return undefined;
  }
  return `\0${id}`;
}

/**
 * Parse a resolved \0analog-inline virtual module ID back to the
 * original file path.  Returns undefined if the ID is not one.
 */
export function fromAnalogInlineId(id: string): string | undefined {
  if (!id.startsWith(ANALOG_INLINE_RESOLVED)) {
    return undefined;
  }
  const rest = id.slice(ANALOG_INLINE_RESOLVED.length);
  const colonIdx = rest.indexOf(':');
  const ext = rest.slice(0, colonIdx);
  const base = rest.slice(colonIdx + 1);
  return `${base}.${ext}`;
}
