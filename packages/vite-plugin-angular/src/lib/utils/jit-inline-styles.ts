// Angular's JIT resource transformer emits inline component styles as
// `angular:jit:style:inline;<base64 of the whole stylesheet>`. Keeping that
// payload in the module id makes the emitted chunk name grow with the
// stylesheet, so a large inline style blows past the 255-byte filename
// limit and the build fails with ENAMETOOLONG. Hash the payload into the
// id and keep the base64 in a lookup table instead. (#2459)

import { createHash } from 'node:crypto';

export const JIT_INLINE_STYLE_PREFIX = 'virtual:angular:jit:style:inline;';

const inlineStyles = new Map<
  string,
  { encoded: string; owners: Set<symbol> }
>();

export interface JitInlineStyles {
  register(encodedStyles: string): string;
  clear(): void;
}

export function createJitInlineStyles(): JitInlineStyles {
  const owner = Symbol('JIT styles');
  const hashes = new Set<string>();
  return {
    register(encodedStyles) {
      const hash = createHash('sha256')
        .update(encodedStyles)
        .digest('hex')
        .slice(0, 16);
      const entry = inlineStyles.get(hash) ?? {
        encoded: encodedStyles,
        owners: new Set<symbol>(),
      };
      entry.owners.add(owner);
      inlineStyles.set(hash, entry);
      hashes.add(hash);
      return `${JIT_INLINE_STYLE_PREFIX}${hash}`;
    },
    clear() {
      for (const hash of hashes) {
        const entry = inlineStyles.get(hash);
        entry?.owners.delete(owner);
        if (entry?.owners.size === 0) inlineStyles.delete(hash);
      }
      hashes.clear();
    },
  };
}

const defaultStyles = createJitInlineStyles();

export function toJitInlineStyleId(encodedStyles: string): string {
  return defaultStyles.register(encodedStyles);
}

export function getJitInlineStyles(hash: string): string | undefined {
  return inlineStyles.get(hash)?.encoded;
}
