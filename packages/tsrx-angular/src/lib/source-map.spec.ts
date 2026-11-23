import { decode, encode } from '@jridgewell/sourcemap-codec';
import { describe, expect, it } from 'vitest';

import {
  jsonLiteral,
  MappedText,
  remapSourceMap,
  TsrxSourceMap,
} from './source-map';

function mapOf(
  original: string,
  mapped: MappedText,
  fileName = '/app/test.tsrx',
): TsrxSourceMap {
  return new TsrxSourceMap(fileName, original, mapped.text, mapped.segments);
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

describe('remapSourceMap', () => {
  const original = [
    'export function Counter() @{',
    '  let count = 0;',
    '  <p>{count}</p>',
    '}',
  ].join('\n');

  function counterMap(fileName: string): TsrxSourceMap {
    const countStart = original.indexOf('count');
    const mapped = new MappedText()
      .append('import { Component } from "@angular/core";\n')
      .append('const x = ')
      .copyRange(original, countStart, countStart + 'count'.length)
      .append(';\n');
    return mapOf(original, mapped, fileName);
  }

  it.each([
    {
      label: 'Windows map.fileName with absolute Windows source',
      fileName: 'C:\\repo\\src\\Counter.tsrx',
      source: 'C:\\repo\\src\\Counter.tsrx.ts',
      expectedSource: 'C:\\repo\\src\\Counter.tsrx',
    },
    {
      label: 'Windows map.fileName with relative Windows source',
      fileName: 'C:\\repo\\src\\Counter.tsrx',
      source: 'src\\Counter.tsrx.ts',
      expectedSource: 'src\\Counter.tsrx',
    },
    {
      label: 'Windows map.fileName with POSIX source',
      fileName: 'C:\\repo\\src\\Counter.tsrx',
      source: 'src/Counter.tsrx.ts',
      expectedSource: 'src/Counter.tsrx',
    },
    {
      label: 'POSIX map.fileName with Windows source',
      fileName: '/repo/src/Counter.tsrx',
      source: 'C:\\repo\\src\\Counter.tsrx.ts',
      expectedSource: 'C:\\repo\\src\\Counter.tsrx',
    },
  ])(
    'remaps matching entry in a multi-source map ($label)',
    ({ fileName, source, expectedSource }) => {
      const map = counterMap(fileName);
      const emitted = JSON.stringify({
        version: 3,
        sources: ['other.ts', source],
        sourcesContent: ['// other', map.generatedText],
        names: ['count'],
        mappings: encode([
          [
            [0, 0, 0, 0],
            [4, 1, 0, 0],
          ],
          [
            [2, 1, 1, 10],
            [8, 1, 1, 12, 0],
          ],
        ]),
      });

      const remapped = JSON.parse(remapSourceMap(emitted, map));

      expect(remapped.sources).toEqual(['other.ts', expectedSource]);
      expect(remapped.sourcesContent).toEqual(['// other', original]);
      expect(decode(remapped.mappings)).toEqual([
        [[0, 0, 0, 0], [4]],
        [
          [2, 1, 1, 6],
          [8, 1, 1, 8, 0],
        ],
      ]);
    },
  );

  it('remaps a single-source map unconditionally', () => {
    const map = counterMap('C:\\repo\\src\\Counter.tsrx');
    const emitted = JSON.stringify({
      version: 3,
      sources: ['Counter.tsrx.ts'],
      sourcesContent: [map.generatedText],
      mappings: encode([[[0, 0, 1, 10]]]),
    });

    const remapped = JSON.parse(remapSourceMap(emitted, map));

    expect(remapped.sources).toEqual(['Counter.tsrx']);
    expect(remapped.sourcesContent).toEqual([original]);
    expect(decode(remapped.mappings)).toEqual([[[0, 0, 1, 6]]]);
  });

  it('returns the original JSON unchanged when no entry matches in a multi-source map', () => {
    const map = counterMap('C:\\repo\\src\\Counter.tsrx');
    const emitted = JSON.stringify({
      version: 3,
      sources: ['other.ts', 'src\\MyCounter.tsrx.ts'],
      sourcesContent: ['// other', '// other counter'],
      mappings: encode([[[0, 1, 1, 10]]]),
    });

    expect(remapSourceMap(emitted, map)).toBe(emitted);
  });
});
