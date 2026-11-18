import { describe, expect, it } from 'vitest';

import { jsonLiteral, MappedText, TsrxSourceMap } from './source-map';

function mapOf(original: string, mapped: MappedText): TsrxSourceMap {
  return new TsrxSourceMap(
    '/app/test.tsrx',
    original,
    mapped.text,
    mapped.segments,
  );
}

describe('TsrxSourceMap', () => {
  it('prefers a copied range over a wrapper with the same bounds', () => {
    const original = '0123456789';
    const mapped = new MappedText()
      .copyRange(original, 3, 6)
      .from({ start: 0, end: 10 });
    const map = mapOf(original, mapped);
    expect(map.toOriginalOffset(0)).toBe(3);
    expect(map.toOriginalOffset(1)).toBe(4);
  });

  it('keeps character mappings across JSON escapes', () => {
    const original = 'xa"b\ny';
    const literal = jsonLiteral(new MappedText().copyRange(original, 1, 5));
    expect(literal.text).toBe('"a\\"b\\n"');
    const map = mapOf(original, literal);
    // "  a  \  "  b  \  n  "
    // 0  1  2  3  4  5  6  7
    expect(map.toOriginalOffset(1)).toBe(1); // a
    expect(map.toOriginalOffset(2)).toBe(2); // the escaped "
    expect(map.toOriginalOffset(3)).toBe(2);
    expect(map.toOriginalOffset(4)).toBe(3); // b
    expect(map.toOriginalOffset(5)).toBe(4); // the escaped newline
    expect(map.toOriginalOffset(6)).toBe(4);
  });
});
