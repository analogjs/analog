import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  TS_EXT_REGEX,
  createDepOptimizerConfig,
  getTsConfigPath,
} from './plugin-config.js';

describe('createDepOptimizerConfig', () => {
  // Regression: an earlier shape returned `{ optimizeDeps, resolve: {
  // conditions: ['style'] } }`. Call sites then merged that into Vite's
  // global `resolve.conditions`, which leaked the `style` condition into
  // every JavaScript resolution — including Tailwind v4's `@plugin`
  // resolver. That broke packages with mixed `style`/`import` exports
  // such as `tailwindcss-primeui`. The `style` condition is now scoped
  // to `.css`-extension requests via `cssExtensionStyleResolverPlugin`,
  // so this helper must not return any global `resolve` block at all.
  it('does not return a global resolve block', () => {
    const config = createDepOptimizerConfig({
      tsconfig: '/project/tsconfig.app.json',
      isProd: false,
      jit: false,
      watchMode: true,
      isTest: false,
      isAstroIntegration: false,
    });

    expect(config).not.toHaveProperty('resolve');
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

describe('getTsConfigPath', () => {
  // Mirrors the Nx/Storybook layout: workspace root with a project below it,
  // where the Vite root is the project directory.
  let workspaceRoot: string;
  let projectRoot: string;
  const projectRelativeTsConfig = 'features/x/.storybook/tsconfig.json';

  beforeAll(() => {
    workspaceRoot = mkdtempSync(join(tmpdir(), 'analog-tsconfig-'));
    projectRoot = join(workspaceRoot, 'features/x');
    mkdirSync(join(workspaceRoot, projectRelativeTsConfig, '..'), {
      recursive: true,
    });
    writeFileSync(join(workspaceRoot, projectRelativeTsConfig), '{}', 'utf-8');
    writeFileSync(join(projectRoot, 'tsconfig.app.json'), '{}', 'utf-8');
  });

  afterAll(() => {
    rmSync(workspaceRoot, { recursive: true, force: true });
  });

  it('resolves a project-relative tsconfig against the vite root', () => {
    expect(
      getTsConfigPath(
        projectRoot,
        './.storybook/tsconfig.json',
        false,
        false,
        false,
        workspaceRoot,
      ),
    ).toBe(resolve(workspaceRoot, projectRelativeTsConfig));
  });

  it('falls back to the workspace root when the vite root misses', () => {
    expect(
      getTsConfigPath(
        projectRoot,
        projectRelativeTsConfig,
        false,
        false,
        false,
        workspaceRoot,
      ),
    ).toBe(resolve(workspaceRoot, projectRelativeTsConfig));
  });

  it('returns an absolute tsconfig untouched', () => {
    const absolute = join(workspaceRoot, projectRelativeTsConfig);

    expect(
      getTsConfigPath(
        projectRoot,
        absolute,
        false,
        false,
        false,
        workspaceRoot,
      ),
    ).toBe(absolute);
  });

  it('reports both attempted paths when neither exists', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    try {
      const resolved = getTsConfigPath(
        projectRoot,
        'missing/tsconfig.json',
        false,
        false,
        false,
        workspaceRoot,
      );

      expect(resolved).toBe(resolve(projectRoot, 'missing/tsconfig.json'));
      expect(error).toHaveBeenCalledWith(
        expect.stringContaining(
          `${resolve(projectRoot, 'missing/tsconfig.json')} or ${resolve(
            workspaceRoot,
            'missing/tsconfig.json',
          )}`,
        ),
      );
    } finally {
      error.mockRestore();
    }
  });
});
