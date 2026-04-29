import { describe, expect, it } from 'vitest';
import { TS_EXT_REGEX, createDepOptimizerConfig } from './plugin-config.js';

describe('createDepOptimizerConfig', () => {
  it('does not add the CSS style condition to global module resolution', () => {
    const config = createDepOptimizerConfig({
      tsconfig: '/project/tsconfig.app.json',
      isProd: false,
      jit: false,
      watchMode: true,
      isTest: false,
      isAstroIntegration: false,
    });

    expect(config).not.toHaveProperty('resolve');
    expect(config.optimizeDeps.include).toEqual([
      'rxjs/operators',
      'rxjs',
      'tslib',
    ]);
  });
});

describe('TS_EXT_REGEX', () => {
  describe('matches genuine TypeScript files', () => {
    it.each([
      '/abs/path/file.ts',
      'file.ts',
      'file.cts',
      'file.mts',
      'file.ts?import',
      'file.ts?v=123',
      'file.cts?inline',
      'file.mts?foo=bar',
      // Generated .ts.map side-files — the regex shouldn't reject `.ts`
      // because of a trailing `.map` segment.
      'file.ts.map',
    ])('%s', (id) => {
      expect(TS_EXT_REGEX.test(id)).toBe(true);
    });
  });

  describe('rejects .tsx and other .ts<letter>… look-alikes', () => {
    it.each([
      'file.tsx',
      'file.ctsx',
      'file.mtsx',
      'file.tsx?import',
      // Historical bug: the old `/\.[cm]?(ts)[^x]?\??/` admitted these
      // because `[^x]?` matched any non-x letter (and `?` allowed zero
      // chars). The fixed form uses a negative lookahead on an ASCII
      // letter, so any `.ts<letter>…` form is rejected.
      'file.tsrx',
      'file.tsrx?import',
      'file.tsrx?v=abc',
      'file.tsz',
      'file.tsd',
    ])('%s', (id) => {
      expect(TS_EXT_REGEX.test(id)).toBe(false);
    });
  });

  describe('rejects unrelated extensions', () => {
    it.each([
      'file.js',
      'file.jsx',
      'file.mjs',
      'file.cjs',
      'file.json',
      'file.html',
      'file.css',
      'file',
    ])('%s', (id) => {
      expect(TS_EXT_REGEX.test(id)).toBe(false);
    });
  });
});
