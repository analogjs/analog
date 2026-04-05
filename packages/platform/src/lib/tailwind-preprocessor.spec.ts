import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
}));

import { tailwindPreprocessor } from './tailwind-preprocessor.js';

describe('tailwindPreprocessor', () => {
  beforeEach(() => {
    vi.mocked(readFileSync).mockReset();
  });

  it('injects a relative @reference for prefixed Tailwind utility usage by default', () => {
    vi.mocked(readFileSync).mockReturnValue(
      '@import "tailwindcss" prefix(sa);',
    );
    const preprocess = tailwindPreprocessor({
      tailwindRootCss: '/project/src/styles/tailwind.css',
    });

    expect(
      preprocess(
        '.demo { @apply sa:text-red-500; }',
        '/project/src/app/demo.component.css',
      ),
    ).toBe(
      '@reference "../styles/tailwind.css";\n.demo { @apply sa:text-red-500; }',
    );
  });

  it('skips injection when the stylesheet already includes a Tailwind reference', () => {
    vi.mocked(readFileSync).mockReturnValue(
      '@import "tailwindcss" prefix(sa);',
    );
    const preprocess = tailwindPreprocessor({
      tailwindRootCss: '/project/src/styles/tailwind.css',
    });
    const code =
      '@reference "../styles/tailwind.css";\n.demo { @apply sa:text-red-500; }';

    expect(preprocess(code, '/project/src/app/demo.component.css')).toBe(code);
  });

  it('skips injection when no Tailwind prefix is configured', () => {
    vi.mocked(readFileSync).mockReturnValue('@import "tailwindcss";');
    const preprocess = tailwindPreprocessor({
      tailwindRootCss: '/project/src/styles/tailwind.css',
    });

    expect(
      preprocess(
        '.demo { @apply sa:text-red-500; }',
        '/project/src/app/demo.component.css',
      ),
    ).toBe('.demo { @apply sa:text-red-500; }');
  });

  it('supports a manual prefix override mode', () => {
    const preprocess = tailwindPreprocessor({
      tailwindRootCss: '/project/src/styles/tailwind.css',
      mode: { prefix: 'tw' },
    });

    expect(
      preprocess(
        '.demo { @apply tw:text-red-500; }',
        '/project/src/app/demo.component.css',
      ),
    ).toBe(
      '@reference "../styles/tailwind.css";\n.demo { @apply tw:text-red-500; }',
    );
    expect(readFileSync).not.toHaveBeenCalled();
  });

  it('supports disabling injection per file', () => {
    vi.mocked(readFileSync).mockReturnValue(
      '@import "tailwindcss" prefix(sa);',
    );
    const preprocess = tailwindPreprocessor({
      tailwindRootCss: '/project/src/styles/tailwind.css',
      mode: (filename) =>
        filename.endsWith('.global.css') ? 'disabled' : 'auto',
    });

    expect(
      preprocess(
        '.demo { @apply sa:text-red-500; }',
        '/project/src/app/demo.global.css',
      ),
    ).toBe('.demo { @apply sa:text-red-500; }');
  });

  it('skips injection for the Tailwind root stylesheet itself', () => {
    vi.mocked(readFileSync).mockReturnValue(
      '@import "tailwindcss" prefix(sa);',
    );
    const preprocess = tailwindPreprocessor({
      tailwindRootCss: '/project/src/styles/tailwind.css',
    });
    const code =
      '@import "tailwindcss" prefix(sa);\n.demo { @apply sa:text-red-500; }';

    expect(preprocess(code, '/project/src/styles/tailwind.css')).toBe(code);
  });

  it('surfaces root stylesheet read failures in auto mode', () => {
    vi.mocked(readFileSync).mockImplementation(() => {
      throw new Error('ENOENT');
    });
    const preprocess = tailwindPreprocessor({
      tailwindRootCss: '/project/src/styles/tailwind.css',
    });

    expect(() =>
      preprocess(
        '.demo { @apply sa:text-red-500; }',
        '/project/src/app/demo.component.css',
      ),
    ).toThrowError('ENOENT');
  });

  it('uses a custom injection predicate when provided', () => {
    vi.mocked(readFileSync).mockReturnValue(
      '@import "tailwindcss" prefix(sa);',
    );
    const shouldInject = vi.fn(() => true);
    const preprocess = tailwindPreprocessor({
      tailwindRootCss: '/project/src/styles/tailwind.css',
      shouldInject,
    });

    expect(
      preprocess(
        '.demo { color: red; }',
        '/project/src/app/demo.component.css',
      ),
    ).toBe('@reference "../styles/tailwind.css";\n.demo { color: red; }');
    expect(shouldInject).toHaveBeenCalledWith(
      '.demo { color: red; }',
      '/project/src/app/demo.component.css',
      'sa',
    );
  });
});
