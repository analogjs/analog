import { describe, expect, it } from 'vitest';

import {
  JIT_INLINE_STYLE_PREFIX,
  getJitInlineStyles,
  toJitInlineStyleId,
} from './jit-inline-styles.js';

describe('toJitInlineStyleId', () => {
  it('keeps the id bounded for large stylesheets (#2459)', () => {
    const encodedStyles = Buffer.from(
      `.a { color: red; }`.repeat(1000),
    ).toString('base64');

    const id = toJitInlineStyleId(encodedStyles, false);

    expect(id.startsWith(JIT_INLINE_STYLE_PREFIX)).toBe(true);
    expect(id.length).toBeLessThan(255);
  });

  it('resolves the hashed id back to the encoded styles', () => {
    const encodedStyles = Buffer.from(`.b { color: blue; }`).toString('base64');

    const id = toJitInlineStyleId(encodedStyles, false);
    const hash = id.split('style:inline;')[1];

    expect(getJitInlineStyles(hash)).toBe(encodedStyles);
  });

  it('keeps the payload in test ids so a fresh process can load them (#2613)', () => {
    const encodedStyles =
      Buffer.from(`.c { color: green; }`).toString('base64');

    const id = toJitInlineStyleId(encodedStyles, true);

    expect(id).toBe(`${JIT_INLINE_STYLE_PREFIX}${encodedStyles}`);
    expect(getJitInlineStyles(id.split('style:inline;')[1])).toBe(
      encodedStyles,
    );
  });
});
