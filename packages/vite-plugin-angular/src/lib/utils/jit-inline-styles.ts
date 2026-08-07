// Angular's JIT resource transformer emits inline component styles as
// `angular:jit:style:inline;<base64 of the whole stylesheet>`. Keeping that
// payload in the module id makes the emitted chunk name grow with the
// stylesheet, so a large inline style blows past the 255-byte filename
// limit and the build fails with ENAMETOOLONG. Hash the payload into the
// id and keep the base64 in a lookup table instead. (#2459)

import { createHash } from 'node:crypto';

export const JIT_INLINE_STYLE_PREFIX = 'virtual:angular:jit:style:inline;';

const inlineStyles = new Map<string, string>();

export function toJitInlineStyleId(encodedStyles: string): string {
  const hash = createHash('sha256')
    .update(encodedStyles)
    .digest('hex')
    .slice(0, 16);
  inlineStyles.set(hash, encodedStyles);
  return `${JIT_INLINE_STYLE_PREFIX}${hash}`;
}

export function getJitInlineStyles(hash: string): string | undefined {
  return inlineStyles.get(hash);
}
