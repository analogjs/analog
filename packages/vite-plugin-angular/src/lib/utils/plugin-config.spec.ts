import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  getTsConfigPath,
  isProdMode,
  resolveTsConfigExtendsChain,
  TS_EXT_REGEX,
} from './plugin-config.js';

describe('isProdMode', () => {
  const originalNodeEnv = process.env['NODE_ENV'];
  afterEach(() => {
    process.env['NODE_ENV'] = originalNodeEnv;
  });

  it('is true for an explicit production mode regardless of NODE_ENV', () => {
    process.env['NODE_ENV'] = 'development';
    expect(isProdMode('production')).toBe(true);
  });

  it('is false for an explicit development mode even under production NODE_ENV (#2462)', () => {
    process.env['NODE_ENV'] = 'production';
    expect(isProdMode('development')).toBe(false);
  });

  it('falls back to NODE_ENV for other modes (unchanged behavior)', () => {
    process.env['NODE_ENV'] = 'production';
    expect(isProdMode(undefined)).toBe(true);
    expect(isProdMode('staging')).toBe(true);

    process.env['NODE_ENV'] = 'development';
    expect(isProdMode(undefined)).toBe(false);
    expect(isProdMode('staging')).toBe(false);
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

describe('resolveTsConfigExtendsChain', () => {
  // Regression (#2555): a caller uses this to explicitly watch every file a
  // tsconfig's `extends` chain pulls settings from, since Vite's own
  // watcher doesn't observe a chain target outside its project root by
  // default (e.g. a monorepo's shared `tsconfig.base.json`).
  let workspaceRoot: string;

  beforeAll(() => {
    // Resolved through `realpathSync` because `require.resolve` (used to
    // resolve a package-specifier `extends` target below) does the same —
    // on macOS, `os.tmpdir()` is under a `/tmp` that's itself a symlink to
    // `/private/tmp`, so without this the two would disagree on identical
    // files.
    workspaceRoot = realpathSync(
      mkdtempSync(join(tmpdir(), 'analog-tsconfig-chain-')),
    );
  });

  afterAll(() => {
    rmSync(workspaceRoot, { recursive: true, force: true });
  });

  it('returns just the leaf when it has no extends', () => {
    const leaf = join(workspaceRoot, 'no-extends.json');
    writeFileSync(leaf, '{}', 'utf-8');

    expect(resolveTsConfigExtendsChain(leaf)).toEqual([leaf]);
  });

  it('includes a relative extends target', () => {
    const base = join(workspaceRoot, 'base.json');
    writeFileSync(base, '{}', 'utf-8');
    const leaf = join(workspaceRoot, 'extends-relative.json');
    writeFileSync(leaf, JSON.stringify({ extends: './base.json' }), 'utf-8');

    expect(resolveTsConfigExtendsChain(leaf)).toEqual([leaf, base]);
  });

  // Regression: TypeScript only appends `.json` to a relative/absolute
  // `extends` target as a fallback when the target doesn't already exist
  // as given — an extensionless file is a real, valid target on its own.
  // Appending `.json` unconditionally would ask for a different,
  // nonexistent file (`baseconfig.json`) instead of the real one.
  it('resolves a relative extends target that has no extension at all', () => {
    const base = join(workspaceRoot, 'baseconfig');
    writeFileSync(base, '{}', 'utf-8');
    const leaf = join(workspaceRoot, 'extends-relative-no-ext.json');
    writeFileSync(leaf, JSON.stringify({ extends: './baseconfig' }), 'utf-8');

    expect(resolveTsConfigExtendsChain(leaf)).toEqual([leaf, base]);
  });

  // Regression: same gap as above, but for a JSON-family extension other
  // than `.json` — `.endsWith('.json')` alone doesn't recognize `.jsonc`
  // as already a complete, valid filename, so appending `.json`
  // unconditionally would ask for `compiler-options.jsonc.json` instead
  // of the real file.
  it('resolves a relative extends target with a .jsonc extension', () => {
    const base = join(workspaceRoot, 'base.jsonc');
    writeFileSync(base, '{}', 'utf-8');
    const leaf = join(workspaceRoot, 'extends-relative-jsonc.json');
    writeFileSync(leaf, JSON.stringify({ extends: './base.jsonc' }), 'utf-8');

    expect(resolveTsConfigExtendsChain(leaf)).toEqual([leaf, base]);
  });

  it('walks a multi-level extends chain, not just one level', () => {
    const root = join(workspaceRoot, 'chain-root.json');
    writeFileSync(root, '{}', 'utf-8');
    const mid = join(workspaceRoot, 'chain-mid.json');
    writeFileSync(
      mid,
      JSON.stringify({ extends: './chain-root.json' }),
      'utf-8',
    );
    const leaf = join(workspaceRoot, 'chain-leaf.json');
    writeFileSync(
      leaf,
      JSON.stringify({ extends: './chain-mid.json' }),
      'utf-8',
    );

    expect(resolveTsConfigExtendsChain(leaf)).toEqual([leaf, mid, root]);
  });

  it('walks every target of an array-form extends (TS 5.0+)', () => {
    const baseA = join(workspaceRoot, 'base-a.json');
    writeFileSync(baseA, '{}', 'utf-8');
    const baseB = join(workspaceRoot, 'base-b.json');
    writeFileSync(baseB, '{}', 'utf-8');
    const leaf = join(workspaceRoot, 'extends-array.json');
    writeFileSync(
      leaf,
      JSON.stringify({ extends: ['./base-a.json', './base-b.json'] }),
      'utf-8',
    );

    expect(resolveTsConfigExtendsChain(leaf)).toEqual([leaf, baseA, baseB]);
  });

  it('does not loop forever on a circular extends chain', () => {
    const a = join(workspaceRoot, 'circular-a.json');
    const b = join(workspaceRoot, 'circular-b.json');
    writeFileSync(a, JSON.stringify({ extends: './circular-b.json' }), 'utf-8');
    writeFileSync(b, JSON.stringify({ extends: './circular-a.json' }), 'utf-8');

    expect(resolveTsConfigExtendsChain(a)).toEqual([a, b]);
  });

  it('stops a branch it cannot resolve instead of throwing', () => {
    const leaf = join(workspaceRoot, 'extends-missing.json');
    writeFileSync(
      leaf,
      JSON.stringify({ extends: './does-not-exist.json' }),
      'utf-8',
    );

    let chain: string[] = [];
    expect(() => {
      chain = resolveTsConfigExtendsChain(leaf);
    }).not.toThrow();
    expect(chain).toEqual([leaf, join(workspaceRoot, 'does-not-exist.json')]);
  });

  it('resolves a package-specifier extends target through node_modules', () => {
    const packageDir = join(workspaceRoot, 'node_modules', 'a-base-config');
    mkdirSync(packageDir, { recursive: true });
    const packageTsconfig = join(packageDir, 'tsconfig.json');
    writeFileSync(packageTsconfig, '{}', 'utf-8');
    const leaf = join(workspaceRoot, 'extends-package.json');
    writeFileSync(
      leaf,
      JSON.stringify({ extends: 'a-base-config/tsconfig.json' }),
      'utf-8',
    );

    expect(resolveTsConfigExtendsChain(leaf)).toEqual([leaf, packageTsconfig]);
  });

  // Regression: an extensionless package subpath (`pkg/base`, as opposed
  // to a bare package specifier with no subpath at all, e.g.
  // `@tsconfig/strictest`) is a real file within the package, not a
  // nested package of its own — it must append `.json` and resolve
  // directly, not go looking for a `pkg/base/package.json` that doesn't
  // exist.
  it('resolves an extensionless package subpath by appending .json', () => {
    const packageDir = join(workspaceRoot, 'node_modules', 'multi-config');
    mkdirSync(packageDir, { recursive: true });
    const baseTsconfig = join(packageDir, 'base.json');
    writeFileSync(baseTsconfig, '{}', 'utf-8');
    const leaf = join(workspaceRoot, 'extends-package-subpath.json');
    writeFileSync(
      leaf,
      JSON.stringify({ extends: 'multi-config/base' }),
      'utf-8',
    );

    expect(resolveTsConfigExtendsChain(leaf)).toEqual([leaf, baseTsconfig]);
  });

  // Regression: a package `exports` map can rewrite an extensionless
  // subpath to a `.json` target of its own — Astro's real package.json
  // does exactly this (`"./tsconfigs/*": "./tsconfigs/*.json"`), so
  // `astro/tsconfigs/strict` resolves but `astro/tsconfigs/strict.json`
  // does not (the map doesn't expose that specifier at all). Appending
  // `.json` unconditionally, as the previous test's fallback does when
  // the exact specifier fails, would ask for a specifier this kind of
  // map was never written to expose and wrongly treat a real, resolvable
  // config as missing — the exact specifier must be tried first.
  it('resolves a package subpath through an Astro-style extensionless exports map', () => {
    const packageDir = join(
      workspaceRoot,
      'node_modules',
      'exports-map-config',
    );
    const tsconfigsDir = join(packageDir, 'tsconfigs');
    mkdirSync(tsconfigsDir, { recursive: true });
    writeFileSync(
      join(packageDir, 'package.json'),
      JSON.stringify({
        name: 'exports-map-config',
        exports: { './tsconfigs/*': './tsconfigs/*.json' },
      }),
      'utf-8',
    );
    const strictTsconfig = join(tsconfigsDir, 'strict.json');
    writeFileSync(strictTsconfig, '{}', 'utf-8');
    const leaf = join(workspaceRoot, 'extends-exports-map-package.json');
    writeFileSync(
      leaf,
      JSON.stringify({ extends: 'exports-map-config/tsconfigs/strict' }),
      'utf-8',
    );

    expect(resolveTsConfigExtendsChain(leaf)).toEqual([leaf, strictTsconfig]);
  });

  // Regression: a bare package specifier (no explicit subpath) isn't a
  // plain Node module resolution — many published base-config packages
  // (the real `@tsconfig/*` ones, most notably) have a `package.json` but
  // no `main`/`exports` JS entry point at all, since they exist purely to
  // be `extends`ed. `require.resolve` on the bare specifier fails for
  // such a package even though it installed fine; TypeScript instead
  // resolves the package's own directory and defaults to its
  // `tsconfig.json`.
  it('resolves a bare package specifier with no JS entry point (e.g. @tsconfig/*)', () => {
    const packageDir = join(workspaceRoot, 'node_modules', 'no-entry-config');
    mkdirSync(packageDir, { recursive: true });
    writeFileSync(
      join(packageDir, 'package.json'),
      JSON.stringify({ name: 'no-entry-config' }),
      'utf-8',
    );
    const packageTsconfig = join(packageDir, 'tsconfig.json');
    writeFileSync(packageTsconfig, '{}', 'utf-8');
    const leaf = join(workspaceRoot, 'extends-bare-package.json');
    writeFileSync(
      leaf,
      JSON.stringify({ extends: 'no-entry-config' }),
      'utf-8',
    );

    expect(resolveTsConfigExtendsChain(leaf)).toEqual([leaf, packageTsconfig]);
  });

  // Regression: the package's own `package.json` can point `extends`
  // callers at a non-default file via a `tsconfig` field, instead of the
  // implicit `tsconfig.json` default.
  it("resolves a bare package specifier through its package.json's tsconfig field", () => {
    const packageDir = join(
      workspaceRoot,
      'node_modules',
      'custom-entry-config',
    );
    mkdirSync(packageDir, { recursive: true });
    writeFileSync(
      join(packageDir, 'package.json'),
      JSON.stringify({
        name: 'custom-entry-config',
        tsconfig: 'configs/base.json',
      }),
      'utf-8',
    );
    const customTsconfigPath = join(packageDir, 'configs', 'base.json');
    mkdirSync(join(packageDir, 'configs'), { recursive: true });
    writeFileSync(customTsconfigPath, '{}', 'utf-8');
    const leaf = join(workspaceRoot, 'extends-custom-field-package.json');
    writeFileSync(
      leaf,
      JSON.stringify({ extends: 'custom-entry-config' }),
      'utf-8',
    );

    expect(resolveTsConfigExtendsChain(leaf)).toEqual([
      leaf,
      customTsconfigPath,
    ]);
  });

  // Regression: a package can expose its bare specifier directly to a
  // config file through its own `exports` map
  // (`"exports": { ".": "./tsconfig.json" }`) — real, valid package
  // resolution TypeScript itself also follows. Such a map can restrict
  // subpaths to only the ones it lists, hiding `./package.json` entirely
  // — trying the package.json-reading fallback *first* would misreport
  // the whole package as unresolvable, when the bare specifier alone
  // already resolves.
  it('resolves a bare package specifier exposed through its own exports map, with no package.json access at all', () => {
    const packageDir = join(workspaceRoot, 'node_modules', 'dot-export-config');
    mkdirSync(packageDir, { recursive: true });
    writeFileSync(
      join(packageDir, 'package.json'),
      JSON.stringify({
        name: 'dot-export-config',
        exports: { '.': './tsconfig.json' },
      }),
      'utf-8',
    );
    const dotExportTsconfig = join(packageDir, 'tsconfig.json');
    writeFileSync(dotExportTsconfig, '{}', 'utf-8');
    const leaf = join(workspaceRoot, 'extends-dot-export-package.json');
    writeFileSync(
      leaf,
      JSON.stringify({ extends: 'dot-export-config' }),
      'utf-8',
    );

    expect(resolveTsConfigExtendsChain(leaf)).toEqual([
      leaf,
      dotExportTsconfig,
    ]);
  });

  // Regression: a package can ship ordinary JS code (a real `main` entry
  // point) *and* separately expose a `tsconfig` field in its
  // `package.json` for others to `extends` — plain `require.resolve` on
  // the bare specifier happily resolves to that JS file, since it's a
  // perfectly valid module on its own, but it isn't a config at all.
  // TypeScript's own `extends` resolution is JSON-typed, not a general
  // "resolve this package" one, so it would never land on that JS file
  // in the first place — accepting it here would silently shadow the
  // real config this package actually wants extended.
  it('reads the tsconfig field instead of a package that also has an ordinary JS entry point', () => {
    const packageDir = join(workspaceRoot, 'node_modules', 'js-and-config');
    mkdirSync(packageDir, { recursive: true });
    writeFileSync(
      join(packageDir, 'package.json'),
      JSON.stringify({
        name: 'js-and-config',
        main: './index.js',
        tsconfig: 'tsconfig.json',
      }),
      'utf-8',
    );
    writeFileSync(
      join(packageDir, 'index.js'),
      'module.exports = {};',
      'utf-8',
    );
    const packageTsconfig = join(packageDir, 'tsconfig.json');
    writeFileSync(packageTsconfig, '{}', 'utf-8');
    const leaf = join(workspaceRoot, 'extends-js-and-config-package.json');
    writeFileSync(leaf, JSON.stringify({ extends: 'js-and-config' }), 'utf-8');

    expect(resolveTsConfigExtendsChain(leaf)).toEqual([leaf, packageTsconfig]);
  });
});
