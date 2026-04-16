import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ResolvedConfig } from 'vite';

import { shouldPreprocessTestCss } from './virtual-resources.js';

const cfg = (css: unknown): ResolvedConfig =>
  ({ test: { css } }) as unknown as ResolvedConfig;

describe('shouldPreprocessTestCss', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Force the helper into its test-mode branch.
    process.env['VITEST'] = 'true';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('returns true when not in test mode (no NODE_ENV/VITEST)', () => {
    delete process.env['VITEST'];
    delete process.env['NODE_ENV'];
    expect(shouldPreprocessTestCss(cfg(false), '/x.scss')).toBe(true);
  });

  it('returns true when test.css is true', () => {
    expect(shouldPreprocessTestCss(cfg(true), '/x.scss')).toBe(true);
  });

  it('returns false when test.css is false', () => {
    expect(shouldPreprocessTestCss(cfg(false), '/x.scss')).toBe(false);
  });

  it('returns false when test.css is unset (Vitest default)', () => {
    expect(shouldPreprocessTestCss(cfg(undefined), '/x.scss')).toBe(false);
    expect(shouldPreprocessTestCss({} as ResolvedConfig, '/x.scss')).toBe(
      false,
    );
  });

  it('matches a single RegExp include (not just arrays)', () => {
    // Vitest's API accepts `RegExp | RegExp[]`, not only arrays. (#2298)
    expect(
      shouldPreprocessTestCss(cfg({ include: /\.scss$/ }), '/foo.scss'),
    ).toBe(true);
    expect(
      shouldPreprocessTestCss(cfg({ include: /\.scss$/ }), '/foo.css'),
    ).toBe(false);
  });

  it('matches a RegExp[] include and respects exclude', () => {
    expect(
      shouldPreprocessTestCss(
        cfg({ include: [/\.scss$/], exclude: [/skip/] }),
        '/foo.scss',
      ),
    ).toBe(true);
    expect(
      shouldPreprocessTestCss(
        cfg({ include: [/\.scss$/], exclude: [/skip/] }),
        '/skip.scss',
      ),
    ).toBe(false);
  });

  it('matches a single string exclude', () => {
    expect(
      shouldPreprocessTestCss(
        cfg({ include: [/.+/], exclude: 'node_modules' }),
        '/proj/node_modules/foo.scss',
      ),
    ).toBe(false);
  });

  it('returns false with object form when filePath is missing', () => {
    expect(shouldPreprocessTestCss(cfg({ include: [/.+/] }))).toBe(false);
  });

  it('returns false with object form when include is empty', () => {
    expect(shouldPreprocessTestCss(cfg({}), '/x.scss')).toBe(false);
  });
});
