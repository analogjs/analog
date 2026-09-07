import { required } from '../../testing/required.test-support.js';
import { describe, expect, it } from 'vitest';

import {
  JIT_INLINE_STYLE_PREFIX,
  getJitInlineStyles,
  toJitInlineStyleId,
  createJitInlineStyles,
} from './jit-inline-styles.js';

describe('toJitInlineStyleId', () => {
  it('keeps the id bounded for large stylesheets (#2459)', () => {
    const encodedStyles = Buffer.from(
      `.a { color: red; }`.repeat(1000),
    ).toString('base64');

    const id = toJitInlineStyleId(encodedStyles);

    expect(id.startsWith(JIT_INLINE_STYLE_PREFIX)).toBe(true);
    expect(id.length).toBeLessThan(255);
  });

  it('resolves the hashed id back to the encoded styles', () => {
    const encodedStyles = Buffer.from(`.b { color: blue; }`).toString('base64');

    const id = toJitInlineStyleId(encodedStyles);
    const hash = id.split('style:inline;')[1];

    expect(getJitInlineStyles(required(hash))).toBe(encodedStyles);
  });

  it('returns undefined for an unknown hash', () => {
    expect(getJitInlineStyles('deadbeefdeadbeef')).toBeUndefined();
  });

  it('retains shared styles until both compiler owners close', () => {
    const first = createJitInlineStyles();
    const second = createJitInlineStyles();
    const encoded = Buffer.from('.owned { color: green }').toString('base64');
    const id = first.register(encoded);
    expect(second.register(encoded)).toBe(id);
    const hash = id.slice(JIT_INLINE_STYLE_PREFIX.length);
    first.clear();
    expect(getJitInlineStyles(hash)).toBe(encoded);
    second.clear();
    expect(getJitInlineStyles(hash)).toBeUndefined();
    expect(first.register(encoded)).toBe(id);
    first.clear();
  });
});
