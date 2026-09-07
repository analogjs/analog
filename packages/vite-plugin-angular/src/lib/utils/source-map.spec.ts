import { describe, expect, it } from 'vitest';
import { normalizePath } from 'vite';
import { resolve } from 'node:path';
import { extractInlineSourceMap, normalizeSourceMap } from './source-map.js';

describe('source map handoff', () => {
  it('resolves authored paths without losing source contents or extension fields', () => {
    const map = {
      version: 3,
      sourceRoot: '../src',
      sources: ['component.ts', 'https://example.test/vendor.ts'],
      sourcesContent: ['export const value = 1;', null],
      names: [],
      mappings: 'AAAA',
      x_google_ignoreList: [1],
    };
    const normalized = JSON.parse(
      normalizeSourceMap(
        JSON.stringify(map),
        resolve('fixture/generated/component.ts'),
      ),
    );
    expect(normalized).toEqual({
      ...map,
      sourceRoot: undefined,
      sources: [
        normalizePath(resolve('fixture/src/component.ts')),
        'https://example.test/vendor.ts',
      ],
    });
    expect(Object.hasOwn(normalized, 'sourceRoot')).toBe(false);
  });

  it('rejects malformed native map contracts at the handoff', () => {
    expect(() =>
      normalizeSourceMap(
        '{"version":3,"sources":[42],"mappings":""}',
        '/component.ts',
      ),
    ).toThrow();
  });

  it('resolves relative sources against a URL source root', () => {
    const normalized = JSON.parse(
      normalizeSourceMap(
        JSON.stringify({
          version: 3,
          sourceRoot: 'https://cdn.example/src',
          sources: ['component.ts'],
          mappings: 'AAAA',
        }),
        '/generated/component.ts',
      ),
    );
    expect(normalized.sources).toEqual([
      'https://cdn.example/src/component.ts',
    ]);
  });

  it.each(['', ';charset=utf-8'])(
    'extracts the final inline map with %s metadata',
    (charset) => {
      const map = '{"version":3,"sources":["component.ts"],"mappings":"AAAA"}';
      const code = `export const value = 1;\n//# sourceMappingURL=data:application/json${charset};base64,${Buffer.from(map).toString('base64')}\n`;
      expect(extractInlineSourceMap(code)).toEqual({
        code: 'export const value = 1;',
        map,
      });
    },
  );

  it.each([
    'export const value = 1;',
    'code\n//# sourceMappingURL=component.js.map',
    'code\n//# sourceMappingURL=data:application/json;base64,',
  ])('preserves code without a complete inline map', (code) => {
    expect(extractInlineSourceMap(code)).toEqual({ code, map: null });
  });
});
