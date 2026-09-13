import * as path from 'node:path';
import * as realFs from 'node:fs';
import { SourceMap } from 'node:module';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { normalizePath, preprocessCSS, resolveConfig } from 'vite';
import { NgtscProgram, readConfiguration } from '@angular/compiler-cli';

vi.mock('vite', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vite')>();
  return {
    ...actual,
    preprocessCSS: vi.fn(actual.preprocessCSS),
  };
});

vi.mock('@angular/compiler-cli', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@angular/compiler-cli')>();
  return {
    ...actual,
    NgtscProgram: vi.fn(function (
      ...args: ConstructorParameters<typeof actual.NgtscProgram>
    ) {
      return new actual.NgtscProgram(...args);
    }),
    readConfiguration: vi.fn(actual.readConfiguration),
  };
});

import type ts from 'typescript';
import * as tsModule from 'typescript';
import {
  angular,
  collectEmittedDiagnostics,
  createFsWatcherCacheInvalidator,
  formatDiagnosticWithLocation,
  getFileMetadata,
  groupDiagnosticsByFile,
  isAngularCompilationFile,
  mapTemplateUpdatesToFiles,
  toAngularCompilationFileReplacements,
  isTestWatchMode,
  type PluginOptions,
} from './angular-vite-plugin';
import type { EmitFileResult } from './models';
import { releaseCssPreprocessorWorkers } from './utils/css-preprocessor-workers';

describe('angularVitePlugin', () => {
  it('should work', () => {
    expect(angular()[0].name).toEqual('@analogjs/vite-plugin-angular');
  });
});

describe('isTestWatchMode', () => {
  it('should return false for vitest --run', () => {
    const result = isTestWatchMode(['--run']);

    expect(result).toBeFalsy();
  });

  it('should return false for vitest run', () => {
    const result = isTestWatchMode(['run']);

    expect(result).toBeFalsy();
  });

  it('should return false for vitest run with a file filter', () => {
    const result = isTestWatchMode(['run', 'src/example.spec.ts']);

    expect(result).toBeFalsy();
  });

  it('should return true for a file filter that contains run', () => {
    const result = isTestWatchMode(['src/run-helpers.spec.ts']);

    expect(result).toBeTruthy();
  });

  it('should return true for vitest --no-run', () => {
    const result = isTestWatchMode(['--no-run']);

    expect(result).toBeTruthy();
  });

  it('should return true for vitest --watch', () => {
    const result = isTestWatchMode(['--watch']);

    expect(result).toBeTruthy();
  });

  it('should return true for vitest watch', () => {
    const result = isTestWatchMode(['watch']);

    expect(result).toBeTruthy();
  });

  it('should return false for vitest --no-watch', () => {
    const result = isTestWatchMode(['--no-watch']);

    expect(result).toBeFalsy();
  });

  it('should return false for vitest --watch=false', () => {
    const result = isTestWatchMode(['--watch=false']);

    expect(result).toBeFalsy();
  });

  it('should return false for vitest --watch false', () => {
    const result = isTestWatchMode(['--watch', 'false']);

    expect(result).toBeFalsy();
  });
});

describe('isAngularCompilationFile', () => {
  const rawComponent = `@Component({ selector: 'app-x', templateUrl: './x.component.html' })
export class XComponent {}`;

  // How rolldown's built-in oxc transform lowers the decorator before this
  // plugin's transform hook runs — the literal `@Component(` is gone.
  const loweredComponent = `XComponent = __decorate([Component({ selector: 'app-x', templateUrl: './x.component.html' })], XComponent);`;

  it('matches raw Angular source via the decorator fast-path (no emit yet)', () => {
    expect(isAngularCompilationFile(rawComponent, false)).toBe(true);
  });

  it('serves oxc-lowered components using emitted output (#2450)', () => {
    // The regex alone cannot see the lowered decorator...
    expect(isAngularCompilationFile(loweredComponent, false)).toBe(false);
    // ...but program membership rescues it, so the AOT output is served.
    expect(isAngularCompilationFile(loweredComponent, true)).toBe(true);
  });

  it('skips non-Angular files that produced no emit', () => {
    expect(isAngularCompilationFile('export const answer = 42;', false)).toBe(
      false,
    );
  });
});

describe('JIT resolveId', () => {
  it('should resolve style files to virtual style ids', () => {
    const plugins = angular({ jit: true });
    const mainPlugin = plugins.find(
      (p) => p.name === '@analogjs/vite-plugin-angular',
    );
    expect(mainPlugin).toBeDefined();

    const resolveId = (mainPlugin as any).resolveId;
    expect(resolveId).toBeDefined();

    // configResolved is required so markStylePathSafe has a config to use
    (mainPlugin as any).configResolved({
      server: { watch: {} },
      safeModulePaths: new Set(),
    });

    const result = resolveId(
      'angular:jit:style:file;./my-component.scss',
      '/project/src/app/my-component.ts',
    );

    // Style imports now resolve to native ?inline paths (not virtual ids)
    expect(result).toBe(
      normalizePath('/project/src/app/my-component.scss') + '?inline',
    );
  });

  it('should resolve template files to virtual raw ids', () => {
    const plugins = angular({ jit: true });
    const mainPlugin = plugins.find(
      (p) => p.name === '@analogjs/vite-plugin-angular',
    );
    expect(mainPlugin).toBeDefined();

    const resolveId = (mainPlugin as any).resolveId;
    expect(resolveId).toBeDefined();

    const result = resolveId(
      'angular:jit:template:file;./my-component.html',
      '/project/src/app/my-component.ts',
    );

    expect(result).toContain('virtual:@analogjs/vite-plugin-angular:raw:');
    expect(result).not.toContain('?analog-raw');
    expect(result).not.toContain('.html');
  });

  it('should resolve bare virtual raw ids to rollup virtual modules', () => {
    const plugins = angular({ jit: true });
    const mainPlugin = plugins.find(
      (p) => p.name === '@analogjs/vite-plugin-angular',
    );
    expect(mainPlugin).toBeDefined();

    const resolveId = (mainPlugin as any).resolveId;
    const virtualId = 'virtual:@analogjs/vite-plugin-angular:raw:test-raw-id';

    expect(resolveId(virtualId)).toBe(`\0${virtualId}`);
  });

  it('should intercept .html?raw imports and remap to virtual raw ids', () => {
    const plugins = angular({ jit: true });
    const mainPlugin = plugins.find(
      (p) => p.name === '@analogjs/vite-plugin-angular',
    );

    const resolveId = (mainPlugin as any).resolveId;

    // Relative path with importer
    const result = resolveId(
      './my-component.html?raw',
      '/project/src/app/my-component.ts',
    );
    expect(result).toContain('virtual:@analogjs/vite-plugin-angular:raw:');
    expect(result).not.toContain('.html');

    // Absolute path
    const result2 = resolveId(
      '/project/src/app/my-component.html?raw',
      '/project/src/app/other.ts',
    );
    expect(result2).toContain('virtual:@analogjs/vite-plugin-angular:raw:');
    expect(result2).not.toContain('.html');
  });

  it('should intercept .html?raw imports even without jit mode', () => {
    const plugins = angular();
    const mainPlugin = plugins.find(
      (p) => p.name === '@analogjs/vite-plugin-angular',
    );

    const resolveId = (mainPlugin as any).resolveId;

    const result = resolveId(
      './my-component.html?raw',
      '/project/src/app/my-component.ts',
    );
    expect(result).toContain('virtual:@analogjs/vite-plugin-angular:raw:');
  });

  it('should emit virtual raw ids that do not look like asset or html resources', () => {
    const assetRE = /\.(svg|png|jpe?g|gif|webp|html)($|\?)/;
    const plugins = angular({ jit: true });
    const mainPlugin = plugins.find(
      (p) => p.name === '@analogjs/vite-plugin-angular',
    );

    const resolveId = (mainPlugin as any).resolveId;
    const virtualId = resolveId(
      'angular:jit:template:file;./my-component.svg',
      '/project/src/app/my-component.ts',
    );

    expect(assetRE.test(virtualId)).toBe(false);
  });

  it('should exclude .ts?raw ids from the transform filter so Vite raw handling stands', () => {
    const plugins = angular({ jit: true });
    const mainPlugin = plugins.find(
      (p) => p.name === '@analogjs/vite-plugin-angular',
    );

    const exclude = (mainPlugin as any).transform.filter.id
      .exclude as unknown[];
    const matchesExclude = (id: string) =>
      exclude.some((re) => re instanceof RegExp && re.test(id));

    // `?raw` ids must be skipped, letting Vite's native raw loader stand (#2356)
    expect(matchesExclude('/project/src/app/foo.ts?raw')).toBe(true);
    expect(matchesExclude('/project/src/app/foo.cts?raw')).toBe(true);
    expect(matchesExclude('/project/src/app/foo.mts?raw')).toBe(true);
    expect(matchesExclude('/project/src/app/foo.ts?import&raw')).toBe(true);

    // Plain and HMR/query .ts ids must still be compiled by Angular
    expect(matchesExclude('/project/src/app/foo.ts')).toBe(false);
    expect(matchesExclude('/project/src/app/foo.ts?t=12345')).toBe(false);
    expect(matchesExclude('/project/src/app/foo.ts?component')).toBe(false);
  });

  it('should resolve style ?inline imports to absolute ?inline paths', () => {
    const plugins = angular({ jit: true });
    const mainPlugin = plugins.find(
      (p) => p.name === '@analogjs/vite-plugin-angular',
    );

    (mainPlugin as any).configResolved({
      server: { watch: {} },
      safeModulePaths: new Set(),
    });

    const resolveId = (mainPlugin as any).resolveId;
    const importer = '/project/src/app/my-component.ts';

    // Relative .scss?inline
    const result = resolveId('./my-component.scss?inline', importer);
    expect(result).toBe(
      normalizePath('/project/src/app/my-component.scss') + '?inline',
    );

    // Absolute .css?inline
    const result2 = resolveId(
      '/project/src/app/my-component.css?inline',
      '/project/src/app/other.ts',
    );
    expect(result2).toBe(
      normalizePath('/project/src/app/my-component.css') + '?inline',
    );
  });

  it('should resolve style ?inline imports even without jit mode', () => {
    const plugins = angular();
    const mainPlugin = plugins.find(
      (p) => p.name === '@analogjs/vite-plugin-angular',
    );

    (mainPlugin as any).configResolved({
      server: { watch: {} },
      safeModulePaths: new Set(),
    });

    const resolveId = (mainPlugin as any).resolveId;

    const result = resolveId(
      './my-component.scss?inline',
      '/project/src/app/my-component.ts',
    );
    expect(result).toBe(
      normalizePath('/project/src/app/my-component.scss') + '?inline',
    );
  });

  it('should resolve JIT style file to ?inline path (not virtual id)', () => {
    const plugins = angular({ jit: true });
    const mainPlugin = plugins.find(
      (p) => p.name === '@analogjs/vite-plugin-angular',
    );

    (mainPlugin as any).configResolved({
      server: { watch: {} },
      safeModulePaths: new Set(),
    });

    const resolveId = (mainPlugin as any).resolveId;
    const result = resolveId(
      'angular:jit:style:file;./my-component.scss',
      '/project/src/app/my-component.ts',
    );

    expect(result).toBe(
      normalizePath('/project/src/app/my-component.scss') + '?inline',
    );
  });
});

describe('load ?inline style imports', () => {
  // Style ?inline imports now flow through Vite's native CSS pipeline.
  // The load hook only marks them as safe in safeModulePaths — it does not
  // read or preprocess the CSS. (#2310)

  function getLoadHook() {
    const plugins = angular();
    const mainPlugin = plugins.find(
      (p) => p.name === '@analogjs/vite-plugin-angular',
    );
    (mainPlugin as any).configResolved({
      server: { watch: {} },
      safeModulePaths: new Set(),
    });
    return (mainPlugin as any).load.bind({});
  }

  it('does not handle ?inline style imports (delegates to Vite CSS pipeline)', async () => {
    const load = getLoadHook();
    // The load hook should return undefined for ?inline CSS — Vite handles it.
    const result = await load('/project/src/app/my-component.scss?inline');
    expect(result).toBeUndefined();
  });

  it('ignores non-style ?inline imports', async () => {
    const load = getLoadHook();
    const result = await load('/project/src/data.json?inline');
    expect(result).toBeUndefined();
  });
});

describe('load virtual raw template imports', () => {
  // Templates (.html, .svg, …) are routed through a virtual module id so
  // Vite's built-in asset/CSS plugins never see a file extension and can't
  // re-tag the id with ?import (which would otherwise return a data URI for
  // .svg) or ?inline. This covers both the main dev path and the Vitest
  // fetchModule path, since resolveId is bypassed for the module-runner.
  const tmpDir = tmpdir();

  function getMainPlugin() {
    const plugins = angular({ jit: true });
    return plugins.find((p) => p.name === '@analogjs/vite-plugin-angular');
  }

  function loadHook() {
    return (getMainPlugin() as any).load.bind({ addWatchFile: vi.fn() });
  }

  it('loads an .svg templateUrl via its virtual raw id', async () => {
    const svgPath = normalizePath(
      path.join(tmpDir, `analog-raw-${Date.now()}.svg`),
    );
    realFs.writeFileSync(
      svgPath,
      '<svg xmlns="http://www.w3.org/2000/svg"><g></g></svg>',
      'utf-8',
    );

    try {
      const mainPlugin = getMainPlugin();
      const resolveId = (mainPlugin as any).resolveId;
      const virtualId = resolveId(
        `angular:jit:template:file;./${path.basename(svgPath)}`,
        path.join(tmpDir, 'host.component.ts'),
      );

      expect(virtualId).toContain('virtual:@analogjs/vite-plugin-angular:raw:');
      expect(virtualId).not.toContain('.svg');

      const addWatchFile = vi.fn();
      const load = (mainPlugin as any).load.bind({ addWatchFile });
      const result = await load(`\0${virtualId}`);

      expect(result).toBeDefined();
      expect(result).toContain('export default');
      expect(result).toContain('<svg');
      expect(result).toContain('</svg>');
      expect(addWatchFile).toHaveBeenCalledWith(svgPath);
    } finally {
      realFs.unlinkSync(svgPath);
    }
  });

  it('handles virtual raw ids without the rollup \\0 prefix (Vitest path)', async () => {
    // Vitest's fetchModule path calls moduleGraph.ensureEntryFromUrl before
    // transformRequest, so resolveId is a no-op for the module-runner and
    // the id reaches load as a bare virtual id.
    const htmlPath = normalizePath(
      path.join(tmpDir, `analog-raw-${Date.now()}.html`),
    );
    realFs.writeFileSync(htmlPath, '<h1>hello</h1>', 'utf-8');

    try {
      const mainPlugin = getMainPlugin();
      const resolveId = (mainPlugin as any).resolveId;
      const virtualId = resolveId(
        `angular:jit:template:file;./${path.basename(htmlPath)}`,
        path.join(tmpDir, 'host.component.ts'),
      );
      const load = (mainPlugin as any).load.bind({ addWatchFile: vi.fn() });

      const result = await load(virtualId);
      expect(result).toBeDefined();
      expect(result).toContain('export default');
      expect(result).toContain('<h1>hello</h1>');
    } finally {
      realFs.unlinkSync(htmlPath);
    }
  });

  it('ignores unrelated ids', async () => {
    const load = loadHook();
    expect(await load('/project/src/data.json?raw')).toBeUndefined();
  });
});

describe('createFsWatcherCacheInvalidator', () => {
  function setup(includeGlobs: string[] = []) {
    const invalidateFsCaches = vi.fn();
    const invalidateTsconfigCaches = vi.fn();
    const performCompilation = vi.fn().mockResolvedValue(undefined);
    const invalidate = createFsWatcherCacheInvalidator(
      invalidateFsCaches,
      invalidateTsconfigCaches,
      performCompilation,
      includeGlobs,
    );

    return {
      invalidateFsCaches,
      invalidateTsconfigCaches,
      performCompilation,
      invalidate,
    };
  }

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('clears fs and tsconfig caches before recompiling', async () => {
    const {
      invalidateFsCaches,
      invalidateTsconfigCaches,
      performCompilation,
      invalidate,
    } = setup();

    invalidate('/project/src/app/new.component.ts');

    expect(invalidateFsCaches).toHaveBeenCalledOnce();
    expect(invalidateTsconfigCaches).toHaveBeenCalledOnce();
    expect(performCompilation).not.toHaveBeenCalled();

    await vi.runAllTimersAsync();

    expect(performCompilation).toHaveBeenCalledOnce();
  });

  it('recompiles for component resources and tsconfig files', async () => {
    const { performCompilation, invalidate } = setup();

    invalidate('/project/src/app/app.component.html');
    await vi.runAllTimersAsync();
    invalidate('/project/src/app/app.component.scss');
    await vi.runAllTimersAsync();
    invalidate('/project/tsconfig.app.json');
    await vi.runAllTimersAsync();

    expect(performCompilation).toHaveBeenCalledTimes(3);
  });

  it('recompiles for files matched by include globs', async () => {
    const { performCompilation, invalidate } = setup([
      '/project/src/content/**/*.md',
    ]);

    invalidate('/project/src/content/post.md');
    await vi.runAllTimersAsync();

    expect(performCompilation).toHaveBeenCalledOnce();
  });

  it('ignores files that cannot affect the program', async () => {
    const {
      invalidateFsCaches,
      invalidateTsconfigCaches,
      performCompilation,
      invalidate,
    } = setup();

    invalidate('/project/src/assets/logo.png');
    invalidate('/project/src/app/data.json');
    await vi.runAllTimersAsync();

    expect(invalidateFsCaches).not.toHaveBeenCalled();
    expect(invalidateTsconfigCaches).not.toHaveBeenCalled();
    expect(performCompilation).not.toHaveBeenCalled();
  });

  it('recompiles when generated declarations change the program', async () => {
    const { invalidateTsconfigCaches, performCompilation, invalidate } =
      setup();
    invalidate('/project/src/routeTree.gen.d.ts');
    expect(invalidateTsconfigCaches).toHaveBeenCalledOnce();
    await vi.runAllTimersAsync();
    expect(performCompilation).toHaveBeenCalledOnce();
  });

  it('recompiles when a spec file is added so it joins the program', async () => {
    const {
      invalidateFsCaches,
      invalidateTsconfigCaches,
      performCompilation,
      invalidate,
    } = setup();

    invalidate('/project/src/app/app.component.spec.ts');
    await vi.runAllTimersAsync();

    expect(invalidateFsCaches).toHaveBeenCalledOnce();
    expect(invalidateTsconfigCaches).toHaveBeenCalledOnce();
    expect(performCompilation).toHaveBeenCalledOnce();
  });

  it('coalesces bursts of events into a single recompilation', async () => {
    const { performCompilation, invalidate } = setup();

    invalidate('/project/src/app/a.component.ts');
    invalidate('/project/src/app/a.component.ts');
    invalidate('/project/src/app/b.component.ts');
    await vi.runAllTimersAsync();

    expect(performCompilation).toHaveBeenCalledOnce();
  });
});

describe('toAngularCompilationFileReplacements', () => {
  it('maps browser file replacements for the Angular compilation host', () => {
    expect(
      toAngularCompilationFileReplacements(
        [
          {
            replace: 'apps/demo/src/environments/environment.ts',
            with: 'apps/demo/src/environments/environment.prod.ts',
          },
          {
            replace: 'apps/demo/src/ssr-only.ts',
            ssr: 'apps/demo/src/ssr-only.server.ts',
          },
        ],
        '/workspace',
      ),
    ).toEqual({
      '/workspace/apps/demo/src/environments/environment.ts':
        '/workspace/apps/demo/src/environments/environment.prod.ts',
    });
  });

  it('returns undefined when no replacements are provided', () => {
    expect(
      toAngularCompilationFileReplacements([], '/workspace'),
    ).toBeUndefined();
  });

  it('returns undefined when all replacements are SSR-only', () => {
    expect(
      toAngularCompilationFileReplacements(
        [
          { replace: 'src/a.ts', ssr: 'src/a.server.ts' },
          { replace: 'src/b.ts', ssr: 'src/b.server.ts' },
        ],
        '/workspace',
      ),
    ).toBeUndefined();
  });

  it('passes through absolute paths without resolving against workspace root', () => {
    expect(
      toAngularCompilationFileReplacements(
        [
          {
            replace: '/absolute/src/env.ts',
            with: '/absolute/src/env.prod.ts',
          },
        ],
        '/workspace',
      ),
    ).toEqual({
      '/absolute/src/env.ts': '/absolute/src/env.prod.ts',
    });
  });

  it('handles a mix of absolute and relative paths', () => {
    expect(
      toAngularCompilationFileReplacements(
        [
          {
            replace: '/absolute/env.ts',
            with: 'relative/env.prod.ts',
          },
        ],
        '/workspace',
      ),
    ).toEqual({
      '/absolute/env.ts': '/workspace/relative/env.prod.ts',
    });
  });
});

describe('mapTemplateUpdatesToFiles', () => {
  it('maps Angular template update ids back to source files', () => {
    const updates = mapTemplateUpdatesToFiles(
      new Map([
        [
          encodeURIComponent(
            'apps/demo/src/app/demo.component.ts@DemoComponent',
          ),
          'export const hmr = true;',
        ],
      ]),
    );

    expect(
      updates.get(`${process.cwd()}/apps/demo/src/app/demo.component.ts`),
    ).toEqual({
      className: 'DemoComponent',
      code: 'export const hmr = true;',
    });
  });

  it('returns an empty map when input is undefined', () => {
    const updates = mapTemplateUpdatesToFiles(undefined);
    expect(updates.size).toBe(0);
  });

  it('returns an empty map when input is empty', () => {
    const updates = mapTemplateUpdatesToFiles(new Map());
    expect(updates.size).toBe(0);
  });

  it('defaults className to empty string when id has no @ separator', () => {
    const updates = mapTemplateUpdatesToFiles(
      new Map([
        [
          encodeURIComponent('apps/demo/src/app/orphan.component.ts'),
          'export const hmr = true;',
        ],
      ]),
    );

    const entry = [...updates.values()][0];
    expect(entry.className).toBe('');
    expect(entry.code).toBe('export const hmr = true;');
  });

  it('maps multiple updates across different files', () => {
    const updates = mapTemplateUpdatesToFiles(
      new Map([
        [
          encodeURIComponent('src/app/foo.component.ts@FooComponent'),
          'const foo = 1;',
        ],
        [
          encodeURIComponent('src/app/bar.component.ts@BarComponent'),
          'const bar = 2;',
        ],
      ]),
    );

    expect(updates.size).toBe(2);
    expect([...updates.values()].map((v) => v.className).sort()).toEqual([
      'BarComponent',
      'FooComponent',
    ]);
  });
});

describe('groupDiagnosticsByFile', () => {
  it('groups each diagnostic under its own file with file:line:column', () => {
    const { errorsByFile, warningsByFile } = groupDiagnosticsByFile({
      errors: [
        {
          text: 'TS2339: Property does not exist',
          location: { file: '/src/app/a.component.ts', line: 5, column: 20 },
        },
      ],
      warnings: [
        {
          text: 'NG8113: All imports are unused',
          location: { file: '/src/app/b.component.ts', line: 3, column: 50 },
        },
      ],
    });

    expect(errorsByFile.get(normalizePath('/src/app/a.component.ts'))).toEqual([
      '/src/app/a.component.ts:5:20: TS2339: Property does not exist',
    ]);
    expect(
      warningsByFile.get(normalizePath('/src/app/b.component.ts')),
    ).toEqual(['/src/app/b.component.ts:3:50: NG8113: All imports are unused']);
  });

  it('does not duplicate a diagnostic across files (one bucket per file)', () => {
    const { warningsByFile } = groupDiagnosticsByFile({
      warnings: [
        {
          text: 'NG8113: unused a',
          location: { file: '/src/a.component.ts', line: 1, column: 0 },
        },
        {
          text: 'NG8113: unused b',
          location: { file: '/src/b.component.ts', line: 1, column: 0 },
        },
      ],
    });

    expect(warningsByFile.size).toBe(2);
    expect(
      [...warningsByFile.values()].every((bucket) => bucket.length === 1),
    ).toBe(true);
  });

  it('accumulates multiple diagnostics for the same file', () => {
    const { errorsByFile } = groupDiagnosticsByFile({
      errors: [
        {
          text: 'TS1: first',
          location: { file: '/src/a.component.ts', line: 1, column: 1 },
        },
        {
          text: 'TS2: second',
          location: { file: '/src/a.component.ts', line: 9, column: 4 },
        },
      ],
    });

    expect(errorsByFile.get(normalizePath('/src/a.component.ts'))).toEqual([
      '/src/a.component.ts:1:1: TS1: first',
      '/src/a.component.ts:9:4: TS2: second',
    ]);
  });

  it('routes location-less diagnostics to the global buckets', () => {
    const { errorsByFile, warningsByFile, globalErrors, globalWarnings } =
      groupDiagnosticsByFile({
        errors: [{ text: 'NG: program-wide error' }],
        warnings: [{ text: 'NG: program-wide warning', location: null }],
      });

    expect(errorsByFile.size).toBe(0);
    expect(warningsByFile.size).toBe(0);
    expect(globalErrors).toEqual(['NG: program-wide error']);
    expect(globalWarnings).toEqual(['NG: program-wide warning']);
  });

  it('defaults missing line/column to 0', () => {
    const { errorsByFile } = groupDiagnosticsByFile({
      errors: [{ text: 'TS1: msg', location: { file: '/src/a.ts' } }],
    });

    expect(errorsByFile.get(normalizePath('/src/a.ts'))).toEqual([
      '/src/a.ts:0:0: TS1: msg',
    ]);
  });

  it('returns empty structures for empty/undefined input', () => {
    const result = groupDiagnosticsByFile({});

    expect(result.errorsByFile.size).toBe(0);
    expect(result.warningsByFile.size).toBe(0);
    expect(result.globalErrors).toEqual([]);
    expect(result.globalWarnings).toEqual([]);
  });
});

describe('collectEmittedDiagnostics', () => {
  const file = (over: Partial<EmitFileResult>): EmitFileResult => ({
    dependencies: [],
    ...over,
  });

  it('aggregates errors and warnings across every output file', () => {
    const outputFiles = new Map<string, EmitFileResult>([
      ['/src/a.component.ts', file({ errors: ['a: error one'] })],
      [
        '/src/b.component.ts',
        file({ errors: ['b: error two'], warnings: ['b: warning one'] }),
      ],
      ['/src/c.component.ts', file({ warnings: ['c: warning two'] })],
    ]);

    const { errors, warnings } = collectEmittedDiagnostics(outputFiles);

    // Every file contributes — a single errored file does not hide the rest.
    expect(errors).toEqual(['a: error one', 'b: error two']);
    expect(warnings).toEqual(['b: warning one', 'c: warning two']);
  });

  it('flattens diagnostic message chains into strings', () => {
    const chain = {
      messageText: 'Type X is not assignable to type Y',
      category: 1,
      code: 2322,
      next: [
        { messageText: "Property 'foo' is missing", category: 1, code: 1 },
      ],
    };

    const outputFiles = new Map<string, EmitFileResult>([
      ['/src/a.component.ts', file({ errors: [chain] })],
    ]);

    const { errors } = collectEmittedDiagnostics(outputFiles);

    expect(errors).toEqual([
      "Type X is not assignable to type Y\n  Property 'foo' is missing",
    ]);
  });

  it('ignores files without diagnostics and returns empty arrays', () => {
    const outputFiles = new Map<string, EmitFileResult>([
      ['/src/a.component.ts', file({ content: 'compiled' })],
    ]);

    expect(collectEmittedDiagnostics(outputFiles)).toEqual({
      errors: [],
      warnings: [],
    });
  });
});

describe('getFileMetadata HMR memoization', () => {
  const createProgram = (sourceFile: ts.SourceFile) =>
    ({
      getSourceFile: () => sourceFile,
      getSyntacticDiagnostics: () => [],
    }) as unknown as ts.BuilderProgram;

  const createSourceFile = () =>
    tsModule.createSourceFile(
      '/src/app/foo.component.ts',
      'export class FooComponent {}',
      tsModule.ScriptTarget.Latest,
      true,
    );

  it('emits the HMR update module once per source file identity', () => {
    const sourceFile = createSourceFile();
    const angularCompiler = {
      emitHmrUpdateModule: vi.fn(() => 'hmr-update-code'),
    };
    const metadata = getFileMetadata(
      createProgram(sourceFile),
      angularCompiler as any,
      true,
      true,
    );

    const first = metadata('/src/app/foo.component.ts');
    const second = metadata('/src/app/foo.component.ts');

    expect(angularCompiler.emitHmrUpdateModule).toHaveBeenCalledOnce();
    expect(first.hmrUpdateCode).toBe('hmr-update-code');
    expect(first.hmrEligible).toBe(true);
    expect(second.hmrUpdateCode).toBe('hmr-update-code');
    expect(second.hmrEligible).toBe(true);
  });

  it('recomputes for a new source file identity', () => {
    const angularCompiler = {
      emitHmrUpdateModule: vi.fn(() => 'hmr-update-code'),
    };

    getFileMetadata(
      createProgram(createSourceFile()),
      angularCompiler as any,
      true,
      true,
    )('/src/app/foo.component.ts');
    getFileMetadata(
      createProgram(createSourceFile()),
      angularCompiler as any,
      true,
      true,
    )('/src/app/foo.component.ts');

    expect(angularCompiler.emitHmrUpdateModule).toHaveBeenCalledTimes(2);
  });

  it('does not emit HMR update modules without liveReload', () => {
    const angularCompiler = {
      emitHmrUpdateModule: vi.fn(() => 'hmr-update-code'),
    };
    const metadata = getFileMetadata(
      createProgram(createSourceFile()),
      angularCompiler as any,
      false,
      true,
    );

    const result = metadata('/src/app/foo.component.ts');

    expect(angularCompiler.emitHmrUpdateModule).not.toHaveBeenCalled();
    expect(result.hmrUpdateCode).toBeUndefined();
    expect(result.hmrEligible).toBe(false);
  });
});

describe('formatDiagnosticWithLocation', () => {
  // Minimal `ts.SourceFile` stand-in: only the bits the formatter touches.
  const sourceFile = (fileName: string, line: number, character: number) =>
    ({
      fileName,
      getLineAndCharacterOfPosition: () => ({ line, character }),
    }) as unknown as ts.SourceFile;

  it('prefixes the message with normalized file:line:column (1-based)', () => {
    const diagnostic = {
      file: sourceFile('/src/app/a.component.ts', 4, 19),
      start: 42,
      messageText: "Property 'foo' does not exist on type 'AppComponent'.",
      category: 1,
      code: 2339,
    } as unknown as ts.Diagnostic;

    // line 4/char 19 (0-based) render as 5:20, matching the Compilation API path.
    expect(formatDiagnosticWithLocation(diagnostic)).toBe(
      "/src/app/a.component.ts:5:20: Property 'foo' does not exist on type 'AppComponent'.",
    );
  });

  it('flattens message chains and keeps the location prefix', () => {
    const diagnostic = {
      file: sourceFile('/src/app/a.component.ts', 0, 0),
      start: 0,
      messageText: {
        messageText: 'Type X is not assignable to type Y',
        category: 1,
        code: 2322,
        next: [
          { messageText: "Property 'foo' is missing", category: 1, code: 1 },
        ],
      },
      category: 1,
      code: 2322,
    } as unknown as ts.Diagnostic;

    expect(formatDiagnosticWithLocation(diagnostic)).toBe(
      "/src/app/a.component.ts:1:1: Type X is not assignable to type Y\n  Property 'foo' is missing",
    );
  });

  it('falls back to the bare message for location-less diagnostics', () => {
    const diagnostic = {
      file: undefined,
      start: undefined,
      messageText: 'Cannot find a tsconfig option.',
      category: 1,
      code: 5000,
    } as unknown as ts.Diagnostic;

    expect(formatDiagnosticWithLocation(diagnostic)).toBe(
      'Cannot find a tsconfig option.',
    );
  });
});

describe('buildStart initial compilation', () => {
  // Rollup runs `buildStart` hooks in parallel, so a plugin registered before
  // this one (e.g. `@module-federation/vite`) can pull modules through
  // `transform` while the initial compilation is still running. `buildStart`
  // has to publish its compilation promise so `transform` waits for the file
  // emitter instead of falling through to esbuild without AOT. (#2425)
  const fixtureDir = path.resolve(
    import.meta.dirname,
    '../../../..',
    'tmp',
    'vpa-buildstart-race',
  );
  const componentPath = normalizePath(
    path.join(fixtureDir, 'src', 'app.component.ts'),
  );
  const templatePath = normalizePath(
    path.join(fixtureDir, 'src', 'app.component.html'),
  );
  const stylePath = normalizePath(
    path.join(fixtureDir, 'src', 'app.component.scss'),
  );

  beforeEach(() => {
    realFs.rmSync(fixtureDir, { recursive: true, force: true });
    realFs.mkdirSync(path.join(fixtureDir, 'src'), { recursive: true });
    realFs.writeFileSync(
      path.join(fixtureDir, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          target: 'ES2022',
          module: 'ES2022',
          moduleResolution: 'bundler',
          experimentalDecorators: true,
          skipLibCheck: true,
          types: [],
        },
        files: ['src/app.component.ts'],
      }),
      'utf-8',
    );
    realFs.writeFileSync(
      componentPath,
      `import { Component } from '@angular/core';

@Component({
  selector: 'app-root',
  standalone: true,
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent {}
`,
      'utf-8',
    );
    realFs.writeFileSync(templatePath, '<h1>hello</h1>', 'utf-8');
    realFs.writeFileSync(
      stylePath,
      '$color: red; h1 { color: $color; }',
      'utf-8',
    );
  });

  afterEach(() => {
    releaseCssPreprocessorWorkers();
    realFs.rmSync(fixtureDir, { recursive: true, force: true });
  });

  // The plugin reads these at creation time to pick the AOT/JIT path, so an
  // app build has to be simulated by clearing Vitest's own markers.
  function createAppBuildPlugin(options: PluginOptions = {}) {
    const { VITEST, NODE_ENV } = process.env;
    delete process.env['VITEST'];
    delete process.env['NODE_ENV'];

    try {
      return angular({
        tsconfig: path.join(fixtureDir, 'tsconfig.json'),
        workspaceRoot: fixtureDir,
        ...options,
      }).find((p) => p.name === '@analogjs/vite-plugin-angular') as any;
    } finally {
      process.env['VITEST'] = VITEST as string;
      if (NODE_ENV) {
        process.env['NODE_ENV'] = NODE_ENV;
      }
    }
  }

  it.each([
    { command: 'build', jit: false },
    { command: 'serve', jit: false },
    { command: 'build', jit: true },
    { command: 'serve', jit: true },
  ] as const)(
    'emits source-linked workspace packages in $command mode (jit=$jit)',
    async ({ command, jit }) => {
      const libDir = path.join(fixtureDir, 'lib');
      realFs.mkdirSync(libDir, { recursive: true });
      realFs.mkdirSync(path.join(fixtureDir, 'node_modules'), {
        recursive: true,
      });
      realFs.writeFileSync(
        path.join(libDir, 'package.json'),
        JSON.stringify({
          name: 'linked-lib',
          type: 'module',
          exports: {
            '.': './index.ts',
            './types': './types.d.ts',
            './*': './*.ts',
          },
        }),
      );
      realFs.writeFileSync(
        path.join(libDir, 'index.ts'),
        "export { DemoDirective } from './directive';",
      );
      realFs.writeFileSync(
        path.join(libDir, 'directive.ts'),
        "import { Directive } from '@angular/core'; @Directive({ selector: '[demo]', standalone: true }) export class DemoDirective {}",
      );
      const declarationPath = path.join(libDir, 'types.d.ts');
      realFs.writeFileSync(
        declarationPath,
        'export interface LinkedType { value: string; }',
      );
      const installedDir = path.join(fixtureDir, 'node_modules/installed-lib');
      realFs.mkdirSync(installedDir, { recursive: true });
      realFs.writeFileSync(
        path.join(installedDir, 'package.json'),
        JSON.stringify({ name: 'installed-lib', exports: './index.ts' }),
      );
      const installedPath = path.join(installedDir, 'index.ts');
      realFs.writeFileSync(installedPath, 'export const installed = 42;');
      realFs.symlinkSync(
        libDir,
        path.join(fixtureDir, 'node_modules/linked-lib'),
        'junction',
      );
      realFs.appendFileSync(
        componentPath,
        "\nexport { DemoDirective } from 'linked-lib';\nexport type { LinkedType } from 'linked-lib/types';\nexport { installed } from 'installed-lib';",
      );
      const entries = Array.from({ length: 8 }, (_, index) => `entry${index}`);
      for (const entry of entries) {
        realFs.writeFileSync(
          path.join(libDir, `${entry}.ts`),
          `export const ${entry} = 42;`,
        );
        realFs.appendFileSync(
          componentPath,
          `\nexport { ${entry} } from 'linked-lib/${entry}';`,
        );
      }
      vi.mocked(NgtscProgram).mockClear();
      const mainPlugin = createAppBuildPlugin({
        disableTypeChecking: false,
        jit,
      });
      await mainPlugin.config({ root: fixtureDir, build: {} }, { command });
      const resolvedConfig = await resolveConfig(
        { configFile: false, root: fixtureDir, mode: 'production' },
        command,
      );
      mainPlugin.configResolved(resolvedConfig);
      const ctx = {
        environment: { config: resolvedConfig },
        warn: vi.fn(),
        error: vi.fn(),
        addWatchFile: vi.fn(),
      };
      await mainPlugin.buildStart.call(ctx);
      if (!jit) {
        const program = vi
          .mocked(NgtscProgram)
          .mock.results[0].value.getTsProgram();
        for (const externalPath of [declarationPath, installedPath]) {
          const sourceFile = program.getSourceFile(normalizePath(externalPath));
          expect(sourceFile).toBeDefined();
          expect(program.isSourceFileFromExternalLibrary(sourceFile)).toBe(
            true,
          );
        }
      }
      const transform = async (name: string) => {
        const id = normalizePath(path.join(libDir, name));
        return mainPlugin.transform.handler.call(
          ctx,
          realFs.readFileSync(id, 'utf8'),
          id,
        );
      };
      expect((await transform('index.ts'))?.code).toContain('DemoDirective');
      expect((await transform('directive.ts'))?.code).toContain(
        jit ? '__decorate' : 'ɵdir',
      );
      expect((await transform('index.ts'))?.code).toContain('DemoDirective');
      const results = await Promise.all(
        entries.map((entry) => transform(`${entry}.ts`)),
      );
      results.forEach((result, index) =>
        expect(result?.code).toContain(`${entries[index]} = 42`),
      );
      expect(NgtscProgram).toHaveBeenCalledTimes(jit ? 0 : 1);
      realFs.appendFileSync(
        path.join(libDir, 'directive.ts'),
        '\nexport const updated = 42;',
      );
      await mainPlugin.handleHotUpdate({
        file: normalizePath(path.join(libDir, 'directive.ts')),
        modules: [],
      });
      expect((await transform('directive.ts'))?.code).toContain('updated = 42');
      expect(NgtscProgram).toHaveBeenCalledTimes(jit ? 0 : 2);
      await mainPlugin.buildEnd.call(ctx);
      expect(ctx.error).not.toHaveBeenCalled();
      const watchers = new Map<string, (file: string) => void>();
      mainPlugin.configureServer({
        watcher: {
          add: () => {
            /* not exercised by this test */
          },
          on: (event: string, handler: (file: string) => void) =>
            watchers.set(event, handler),
        },
      });
      const barrel = normalizePath(path.join(libDir, 'index.ts'));
      realFs.rmSync(barrel);
      vi.useFakeTimers();
      try {
        const unlink = watchers.get('unlink');
        expect(unlink).toBeDefined();
        unlink?.(barrel);
        await vi.advanceTimersByTimeAsync(100);
        await mainPlugin.buildStart.call(ctx);
        expect(
          await mainPlugin.transform.handler.call(ctx, '', barrel),
        ).toBeUndefined();
      } finally {
        vi.useRealTimers();
      }
      await mainPlugin.buildEnd.call(ctx);
      expect(ctx.warn).not.toHaveBeenCalled();
    },
    60_000,
  );

  it('waits for the initial compilation before emitting a transform result', async () => {
    const mainPlugin = createAppBuildPlugin();

    await mainPlugin.config(
      { root: fixtureDir, build: {} },
      { command: 'build' },
    );
    const resolvedConfig = await resolveConfig(
      { configFile: false, root: fixtureDir, mode: 'production' },
      'build',
    );
    mainPlugin.configResolved(resolvedConfig);

    const ctx = {
      environment: { config: resolvedConfig },
      warn: vi.fn(),
      error: vi.fn(),
      addWatchFile: vi.fn(),
    };
    const code = realFs.readFileSync(componentPath, 'utf-8');

    // Deliberately don't await `buildStart` — this is the racing plugin's view.
    const buildStart = mainPlugin.buildStart.call(ctx);
    const result = await mainPlugin.transform.handler.call(
      ctx,
      code,
      componentPath,
    );
    await buildStart;

    expect(result?.code).toContain('ɵcmp');
    expect(ctx.warn).not.toHaveBeenCalled();
  }, 60_000);

  it('emits sourcemaps for production builds when build.sourcemap is enabled', async () => {
    const mainPlugin = createAppBuildPlugin();
    realFs.writeFileSync(
      componentPath,
      `import { Component } from '@angular/core';

@Component({
  selector: 'app-root',
  standalone: true,
  templateUrl: './app.component.html',
})
export class AppComponent {}
`,
      'utf-8',
    );

    await mainPlugin.config(
      { root: fixtureDir, build: { sourcemap: true } },
      { command: 'build' },
    );
    const resolvedConfig = await resolveConfig(
      {
        configFile: false,
        root: fixtureDir,
        mode: 'production',
        build: { sourcemap: true },
      },
      'build',
    );
    mainPlugin.configResolved(resolvedConfig);

    const ctx = {
      environment: { config: resolvedConfig },
      warn: vi.fn(),
      error: vi.fn(),
      addWatchFile: vi.fn(),
    };
    const code = realFs.readFileSync(componentPath, 'utf-8');

    await mainPlugin.buildStart.call(ctx);
    const result = await mainPlugin.transform.handler.call(
      ctx,
      code,
      componentPath,
    );

    expect(result?.code).toContain('ɵcmp');
    const generatedOffset = result.code.indexOf('AppComponent');
    const generatedBeforeTarget = result.code.slice(0, generatedOffset);
    const generatedLine = generatedBeforeTarget.split('\n').length - 1;
    const generatedColumn =
      generatedOffset - generatedBeforeTarget.lastIndexOf('\n') - 1;
    const entry = new SourceMap(JSON.parse(result.map)).findEntry(
      generatedLine,
      generatedColumn,
    );
    const sources = JSON.parse(result.map).sources as string[];

    expect(entry.originalSource).toBe(normalizePath(componentPath));
    expect(entry.originalLine).toBe(7);
    expect(entry.originalColumn).toBe(13);
    expect(sources).toContain(normalizePath(templatePath));
  }, 60_000);

  it('refreshes diagnostics when a declaration changes without restarting', async () => {
    const declaration = path.join(fixtureDir, 'src/routes.d.ts');
    realFs.writeFileSync(declaration, "type RoutePath = '/about';");
    const tsconfig = path.join(fixtureDir, 'tsconfig.json');
    const config = JSON.parse(realFs.readFileSync(tsconfig, 'utf8'));
    config.include = ['src/**/*.d.ts'];
    realFs.writeFileSync(tsconfig, JSON.stringify(config));
    const code = `
      import { Component } from '@angular/core';
      @Component({ standalone: true, template: '' })
      export class AppComponent { path: RoutePath = '/about'; }
    `;
    realFs.writeFileSync(componentPath, code);
    const mainPlugin = createAppBuildPlugin({ disableTypeChecking: false });
    await mainPlugin.config({ root: fixtureDir }, { command: 'serve' });
    const resolvedConfig = await resolveConfig(
      {
        configFile: false,
        root: fixtureDir,
        mode: 'development',
      },
      'serve',
    );
    mainPlugin.configResolved(resolvedConfig);
    const ctx = {
      environment: { config: resolvedConfig },
      warn: vi.fn(),
      error: vi.fn(),
      addWatchFile: vi.fn(),
    };
    await mainPlugin.buildStart.call(ctx);
    await mainPlugin.transform.handler.call(ctx, code, componentPath);
    expect(ctx.error).not.toHaveBeenCalled();

    const server = {
      moduleGraph: { invalidateAll: vi.fn() },
      ws: { send: vi.fn() },
    };
    realFs.writeFileSync(declaration, "type RoutePath = '/renamed';");
    await mainPlugin.handleHotUpdate({
      file: declaration,
      modules: [],
      server,
    });
    await mainPlugin.transform.handler.call(ctx, code, componentPath);
    expect(ctx.error).toHaveBeenCalledWith(
      expect.stringContaining('is not assignable'),
    );
    expect(server.moduleGraph.invalidateAll).toHaveBeenCalledOnce();
    expect(server.ws.send).toHaveBeenCalledWith({ type: 'full-reload' });

    ctx.error.mockClear();
    realFs.writeFileSync(declaration, "type RoutePath = '/about';");
    await mainPlugin.handleHotUpdate({
      file: declaration,
      modules: [],
      server,
    });
    await mainPlugin.transform.handler.call(ctx, code, componentPath);
    expect(ctx.error).not.toHaveBeenCalled();
  }, 60_000);

  it('releases production compilation output at buildEnd', async () => {
    const mainPlugin = createAppBuildPlugin();

    await mainPlugin.config(
      { root: fixtureDir, build: {} },
      { command: 'build' },
    );
    const resolvedConfig = await resolveConfig(
      { configFile: false, root: fixtureDir, mode: 'production' },
      'build',
    );
    mainPlugin.configResolved(resolvedConfig);
    const ctx = {
      environment: { config: resolvedConfig },
      warn: vi.fn(),
      error: vi.fn(),
      addWatchFile: vi.fn(),
    };
    const code = realFs.readFileSync(componentPath, 'utf-8');

    await mainPlugin.buildStart.call(ctx);
    const compiled = await mainPlugin.transform.handler.call(
      ctx,
      code,
      componentPath,
    );
    await mainPlugin.buildEnd.call(ctx);
    const released = await mainPlugin.transform.handler.call(
      ctx,
      code,
      componentPath,
    );

    expect(compiled?.code).toContain('ɵcmp');
    expect(released).toBeUndefined();
  }, 60_000);

  it('preprocesses styles with the top-level resolved config (#2556)', async () => {
    // Vite keys its CSS preprocessor worker cache by the top-level config
    // object, so `this.environment.config` (a distinct object) must never be
    // handed to `preprocessCSS` — that falls back to a worker Vite never
    // closes and keeps Vitest from exiting.
    vi.mocked(preprocessCSS).mockClear();
    const mainPlugin = createAppBuildPlugin();

    await mainPlugin.config(
      { root: fixtureDir, build: {} },
      { command: 'build' },
    );
    const resolvedConfig = await resolveConfig(
      { configFile: false, root: fixtureDir, mode: 'production' },
      'build',
    );
    mainPlugin.configResolved(resolvedConfig);
    const ctx = {
      environment: { config: resolvedConfig.environments['client'] },
      warn: vi.fn(),
      error: vi.fn(),
      addWatchFile: vi.fn(),
    };

    await mainPlugin.buildStart.call(ctx);

    expect(ctx.environment.config).not.toBe(resolvedConfig);
    expect(vi.mocked(preprocessCSS)).toHaveBeenCalled();
    for (const [, , config] of vi.mocked(preprocessCSS).mock.calls) {
      expect(config).toBe(resolvedConfig);
    }
  }, 60_000);

  it('handles missing this.environment gracefully', async () => {
    const mainPlugin = createAppBuildPlugin();

    await mainPlugin.config(
      { root: fixtureDir, build: {} },
      { command: 'build' },
    );
    const resolvedConfig = await resolveConfig(
      { configFile: false, root: fixtureDir, mode: 'production' },
      'build',
    );
    mainPlugin.configResolved(resolvedConfig);

    // Context without this.environment (e.g. older Vite or minimal test harness)
    const ctx = {
      warn: vi.fn(),
      error: vi.fn(),
      addWatchFile: vi.fn(),
    };
    const code = realFs.readFileSync(componentPath, 'utf-8');

    await mainPlugin.buildStart.call(ctx);
    const result = await mainPlugin.transform.handler.call(
      ctx,
      code,
      componentPath,
    );

    expect(result?.code).toContain('ɵcmp');
  }, 60_000);
});

describe('vitest coverage regression (#2555)', () => {
  // `@vitest/coverage-v8` transforms every file matching `coverage.include`
  // that no test loaded, to report it as uncovered. In the installed
  // `@vitest/coverage-v8@4.0.18` (`node_modules/@vitest/coverage-v8/dist/
  // provider.js`), `getCoverageMapForUncoveredFiles` (:99) calls
  // `getSources`, which transforms the file through
  // `project.vite.environments[environment].transformRequest(filepath)`
  // (:233) — the exact call this test drives below via
  // `sourcemapPlugin.transform`/the real dev server's `transformRequest`
  // in the sibling e2e test — then `remapCoverage` (:127) parses the
  // transformed output with `parseAstAsync(result.code)` (:133); on a
  // throw it logs `Failed to parse ${filename}. Excluding it from
  // coverage.` (:135) and drops the file entirely — the reported
  // PARSE_ERROR. A component outside the TypeScript program (e.g. one no
  // spec imports) used to reach that call as raw, untranspiled
  // TypeScript: the main plugin hands it off with a warning, and the
  // Vitest sourcemap plugin's OXC/esbuild fallback either threw on
  // parameter decorators or emitted an `@oxc-project/runtime` import
  // that isn't a project dependency, so `parseAstAsync` above failed and
  // coverage-v8 dropped the file.
  const fixtureDir = path.resolve(
    import.meta.dirname,
    '../../../..',
    'tmp',
    'vpa-vitest-coverage-2555',
  );
  const appComponentPath = normalizePath(
    path.join(fixtureDir, 'src', 'app.component.ts'),
  );
  const untestedComponentPath = normalizePath(
    path.join(fixtureDir, 'src', 'untested.component.ts'),
  );

  beforeEach(() => {
    realFs.rmSync(fixtureDir, { recursive: true, force: true });
    realFs.mkdirSync(path.join(fixtureDir, 'src'), { recursive: true });
    realFs.writeFileSync(
      path.join(fixtureDir, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          target: 'ES2022',
          module: 'ES2022',
          moduleResolution: 'bundler',
          experimentalDecorators: true,
          skipLibCheck: true,
          types: [],
        },
        // Only app.component.ts is in the program — untested.component.ts
        // below is deliberately not referenced from `files`/`include` or
        // from any spec, matching the shape reported in #2555.
        files: ['src/app.component.ts'],
      }),
      'utf-8',
    );
    realFs.writeFileSync(
      appComponentPath,
      `import { Component } from '@angular/core';

@Component({
  selector: 'app-root',
  standalone: true,
  template: '<h1>hello</h1>',
})
export class AppComponent {}
`,
      'utf-8',
    );
    realFs.writeFileSync(
      untestedComponentPath,
      `import { Component, Inject, InjectionToken, OnInit } from '@angular/core';

export const TOKEN = new InjectionToken<string>('TOKEN');

@Component({ selector: 'app-untested', template: '<p>untested</p>' })
export class UntestedComponent implements OnInit {
  production: boolean = false;

  constructor(@Inject(TOKEN) private readonly token: string) {}

  ngOnInit(): void {
    console.log(this.token);
  }
}
`,
      'utf-8',
    );
  });

  afterEach(() => {
    releaseCssPreprocessorWorkers();
    realFs.rmSync(fixtureDir, { recursive: true, force: true });
  });

  it('lets the Vitest sourcemap plugin recover a file the Angular program skipped', async () => {
    // Unlike `createAppBuildPlugin` elsewhere in this file, VITEST/NODE_ENV
    // are left untouched (this file already runs under Vitest) so `isTest`
    // is true and `angularVitestPlugins(...)` are registered below — that
    // registration, and the compiler options it now receives, are what
    // #2555's fix relies on.
    const plugins = angular({
      tsconfig: path.join(fixtureDir, 'tsconfig.json'),
      workspaceRoot: fixtureDir,
    });
    const mainPlugin = plugins.find(
      (p) => p.name === '@analogjs/vite-plugin-angular',
    ) as any;
    const sourcemapPlugin = plugins.find(
      (p) => p.name === '@analogjs/vitest-angular-sourcemap-plugin',
    ) as any;
    expect(mainPlugin).toBeDefined();
    expect(sourcemapPlugin).toBeDefined();

    // `command: 'serve'` (what Vitest actually runs under) turns on
    // `watchMode`, which is what makes the plugin's initial compilation
    // eagerly emit every root file into `outputFiles` while `isTest` is
    // true — the on-demand `outputFile` callback used for real (non-test)
    // builds is only wired up when `isTest` is false.
    await mainPlugin.config(
      { root: fixtureDir, build: {} },
      { command: 'serve' },
    );
    const resolvedConfig = await resolveConfig(
      { configFile: false, root: fixtureDir, mode: 'test' },
      'serve',
    );
    mainPlugin.configResolved(resolvedConfig);

    const ctx = {
      environment: { config: resolvedConfig },
      warn: vi.fn(),
      error: vi.fn(),
      addWatchFile: vi.fn(),
    };

    await mainPlugin.buildStart.call(ctx);

    const untestedCode = realFs.readFileSync(untestedComponentPath, 'utf-8');
    const mainResult = await mainPlugin.transform.handler.call(
      ctx,
      untestedCode,
      untestedComponentPath,
    );

    // Not in the program: the main plugin hands it off, warning because it
    // still has Angular decorators.
    expect(mainResult).toBeUndefined();
    expect(ctx.warn).toHaveBeenCalledTimes(1);
    expect(ctx.warn.mock.calls[0][0]).toContain(
      'is not in the TypeScript program',
    );

    // This is the next call in the real pipeline `@vitest/coverage-v8`
    // drives (same code, unchanged, walking the rest of the plugin
    // list) — `getSources`'s own transform call
    // (`transformRequest`/`provider.js:233`, cited above) reaches this
    // same plugin the same way.
    const sourcemapResult = await sourcemapPlugin.transform(
      untestedCode,
      untestedComponentPath,
    );

    expect(sourcemapResult?.code).toBeDefined();
    // `remapCoverage`'s own parse call (`provider.js:133`, cited above) —
    // a throw here is exactly what coverage-v8 reports as a PARSE_ERROR
    // and excludes the file for.
    const { parseAstAsync } = await import('vite');
    await expect(parseAstAsync(sourcemapResult.code)).resolves.toBeDefined();
    expect(sourcemapResult.code).not.toContain('implements');
    expect(sourcemapResult.code).not.toContain('@oxc-project/runtime');

    // The in-program file is unaffected: still compiled by the main
    // plugin (JIT is the default under `isTest`, hence `__decorate`
    // rather than `ɵcmp`).
    const appResult = await mainPlugin.transform.handler.call(
      ctx,
      realFs.readFileSync(appComponentPath, 'utf-8'),
      appComponentPath,
    );
    expect(appResult?.code).toContain('__decorate');
    expect(appResult?.code).toContain('Component(');

    await mainPlugin.buildEnd.call(ctx);
  }, 60_000);

  // Regression: the project-root containment check that keeps this
  // fallback from applying this app's own compiler options to a
  // workspace-linked dependency's files (see the tests further below)
  // must not, in fixing that, start rejecting an ordinary layout where
  // the tsconfig itself lives somewhere other than the source it
  // actually covers — a shared `tsconfig.spec.json` under its own
  // `config/` directory, `include`ing `../src/**/*.ts`, is a real,
  // valid TypeScript project, not a foreign one. The boundary has to be
  // the resolved Vite project root, not `dirname` of the tsconfig path.
  it('still applies compiler options to a decorated file when the tsconfig itself lives in a different directory than its source', async () => {
    const configDir = path.join(fixtureDir, 'config');
    realFs.mkdirSync(configDir, { recursive: true });
    realFs.writeFileSync(
      path.join(configDir, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          target: 'ES2022',
          module: 'ES2022',
          moduleResolution: 'bundler',
          experimentalDecorators: true,
          skipLibCheck: true,
          types: [],
        },
        // Only `app.component.ts` is in the program, matching the
        // sibling fixtures above — `untested.component.ts` deliberately
        // isn't referenced, so the main plugin still skips it and this
        // fallback still has to recover it.
        files: ['../src/app.component.ts'],
      }),
      'utf-8',
    );

    const plugins = angular({
      tsconfig: path.join(configDir, 'tsconfig.json'),
      workspaceRoot: fixtureDir,
    });
    const mainPlugin = plugins.find(
      (p) => p.name === '@analogjs/vite-plugin-angular',
    ) as any;
    const sourcemapPlugin = plugins.find(
      (p) => p.name === '@analogjs/vitest-angular-sourcemap-plugin',
    ) as any;

    await mainPlugin.config(
      { root: fixtureDir, build: {} },
      { command: 'serve' },
    );
    const resolvedConfig = await resolveConfig(
      { configFile: false, root: fixtureDir, mode: 'test' },
      'serve',
    );
    mainPlugin.configResolved(resolvedConfig);

    const ctx = {
      environment: { config: resolvedConfig },
      warn: vi.fn(),
      error: vi.fn(),
      addWatchFile: vi.fn(),
    };
    await mainPlugin.buildStart.call(ctx);

    const untestedCode = realFs.readFileSync(untestedComponentPath, 'utf-8');
    const sourcemapResult = await sourcemapPlugin.transform(
      untestedCode,
      untestedComponentPath,
    );

    expect(sourcemapResult?.code).toBeDefined();
    const { parseAstAsync } = await import('vite');
    await expect(parseAstAsync(sourcemapResult.code)).resolves.toBeDefined();
    // The fixture's tsconfig sets `experimentalDecorators: true` — the
    // injection call must survive lowering, proving this file was still
    // transpiled with the app's own compiler options despite the
    // tsconfig living in a different directory than `src/`.
    expect(sourcemapResult.code).toContain('Inject(TOKEN)');
    expect(sourcemapResult.code).toContain('__param');

    await mainPlugin.buildEnd.call(ctx);
  }, 60_000);

  // Regression: Vite's own watcher only observes its project root and a
  // handful of config dependencies by default — a monorepo's tsconfig
  // `extends` chain (e.g. a shared `tsconfig.base.json` above the
  // project root) can sit entirely outside that root, so a live edit to
  // it would otherwise never even reach the `'change'` handler that
  // invalidates `vitestFallbackCompilerOptions`. `configureServer` must
  // explicitly add every file in the chain to the watcher so Vite
  // observes them regardless of root.
  it('watches the tsconfig extends chain explicitly, not just the leaf (default strategy)', async () => {
    const baseTsconfigPath = path.join(fixtureDir, 'tsconfig.base.json');
    realFs.writeFileSync(
      baseTsconfigPath,
      JSON.stringify({ compilerOptions: {} }),
      'utf-8',
    );
    realFs.writeFileSync(
      path.join(fixtureDir, 'tsconfig.json'),
      JSON.stringify({
        extends: './tsconfig.base.json',
        compilerOptions: {
          target: 'ES2022',
          module: 'ES2022',
          moduleResolution: 'bundler',
          experimentalDecorators: true,
          skipLibCheck: true,
          types: [],
        },
        files: ['src/app.component.ts'],
      }),
      'utf-8',
    );

    const plugins = angular({
      tsconfig: path.join(fixtureDir, 'tsconfig.json'),
      workspaceRoot: fixtureDir,
    });
    const mainPlugin = plugins.find(
      (p) => p.name === '@analogjs/vite-plugin-angular',
    ) as any;

    await mainPlugin.config(
      { root: fixtureDir, build: {} },
      { command: 'serve' },
    );

    const watchedPaths: string[] = [];
    mainPlugin.configureServer({
      watcher: {
        add: (p: string) => watchedPaths.push(normalizePath(p)),
        on: () => {
          /* not exercised by this test */
        },
      },
    });

    expect(watchedPaths).toContain(
      normalizePath(path.join(fixtureDir, 'tsconfig.json')),
    );
    expect(watchedPaths).toContain(normalizePath(baseTsconfigPath));
  });

  // Regression: the chain above is only known at the moment it's first
  // resolved — an edit that points `extends` at a *different* file (not
  // just a content edit to an already-known one) must re-resolve the
  // chain and start watching the new target too, or a later edit to it
  // would never be observed either.
  it('starts watching a newly introduced extends target after a tsconfig edit (default strategy)', async () => {
    const originalBasePath = path.join(
      fixtureDir,
      'tsconfig.original-base.json',
    );
    realFs.writeFileSync(
      originalBasePath,
      JSON.stringify({ compilerOptions: {} }),
      'utf-8',
    );
    const tsconfigPath = path.join(fixtureDir, 'tsconfig.json');
    const compilerOptions = {
      target: 'ES2022',
      module: 'ES2022',
      moduleResolution: 'bundler',
      experimentalDecorators: true,
      skipLibCheck: true,
      types: [],
    };
    realFs.writeFileSync(
      tsconfigPath,
      JSON.stringify({
        extends: './tsconfig.original-base.json',
        compilerOptions,
        files: ['src/app.component.ts'],
      }),
      'utf-8',
    );

    const plugins = angular({
      tsconfig: tsconfigPath,
      workspaceRoot: fixtureDir,
    });
    const mainPlugin = plugins.find(
      (p) => p.name === '@analogjs/vite-plugin-angular',
    ) as any;

    await mainPlugin.config(
      { root: fixtureDir, build: {} },
      { command: 'serve' },
    );

    const watchedPaths: string[] = [];
    const watchers = new Map<string, (file: string) => void>();
    mainPlugin.configureServer({
      watcher: {
        add: (p: string) => watchedPaths.push(normalizePath(p)),
        on: (event: string, handler: (file: string) => void) =>
          watchers.set(event, handler),
      },
    });

    expect(watchedPaths).toContain(normalizePath(originalBasePath));

    const newBasePath = path.join(fixtureDir, 'tsconfig.new-base.json');
    realFs.writeFileSync(
      newBasePath,
      JSON.stringify({ compilerOptions: {} }),
      'utf-8',
    );
    realFs.writeFileSync(
      tsconfigPath,
      JSON.stringify({
        extends: './tsconfig.new-base.json',
        compilerOptions,
        files: ['src/app.component.ts'],
      }),
      'utf-8',
    );
    watchers.get('change')?.(normalizePath(tsconfigPath));

    expect(watchedPaths).toContain(normalizePath(newBasePath));
  });

  // Regression: `fastCompile` (the default under `isTest`, i.e. real
  // Vitest usage) never runs `performCompilation`/`performAngularCompilation`
  // at all in JIT mode — those are the only two places that used to hand
  // resolved compiler options to the sourcemap plugin. Without its own
  // route to the real tsconfig, the fallback would silently fall back to
  // TypeScript's own defaults (standard decorators), which drop a
  // constructor parameter decorator like `@Inject(TOKEN)` — untested
  // dependency-injection metadata disappearing without even an error.
  it('preserves constructor injection metadata under fastCompile (no side-channel to depend on)', async () => {
    const plugins = angular({
      tsconfig: path.join(fixtureDir, 'tsconfig.json'),
      workspaceRoot: fixtureDir,
      fastCompile: true,
    });
    const fastCompilePlugin = plugins.find(
      (p) => (p as any)?.name === '@analogjs/vite-plugin-angular-fast-compile',
    ) as any;
    const sourcemapPlugin = plugins.find(
      (p) => (p as any)?.name === '@analogjs/vitest-angular-sourcemap-plugin',
    ) as any;
    expect(fastCompilePlugin).toBeDefined();
    expect(sourcemapPlugin).toBeDefined();

    // Vite always calls `config` on every registered plugin before any
    // `transform` hook fires — `fastCompilePlugin` is the one that
    // resolves the real tsconfig path here (`compilationPlugin.api`),
    // not the legacy `angularPlugin`, which this array doesn't even
    // contain when `fastCompile` is on.
    await fastCompilePlugin.config(
      { root: fixtureDir, build: {} },
      { command: 'serve' },
    );

    const untestedCode = realFs.readFileSync(untestedComponentPath, 'utf-8');
    const sourcemapResult = await sourcemapPlugin.transform(
      untestedCode,
      untestedComponentPath,
    );

    expect(sourcemapResult?.code).toBeDefined();
    const { parseAstAsync } = await import('vite');
    await expect(parseAstAsync(sourcemapResult.code)).resolves.toBeDefined();
    // The fixture's tsconfig sets `experimentalDecorators: true` (Angular's
    // own CLI default) — the injection call must survive lowering, not be
    // silently discarded as it would be under TypeScript's own default of
    // standard decorators.
    expect(sourcemapResult.code).toContain('Inject(TOKEN)');
    expect(sourcemapResult.code).toContain('__param');
  });

  // Regression: coverage calls this fallback once per untested decorated
  // file in the app — re-reading and reparsing the same tsconfig from disk
  // every time doesn't scale to a large app with many such files.
  it('reads the tsconfig at most once across multiple untested files', async () => {
    const secondUntestedComponentPath = normalizePath(
      path.join(fixtureDir, 'src', 'untested-2.component.ts'),
    );
    realFs.writeFileSync(
      secondUntestedComponentPath,
      `import { Component, Inject, InjectionToken } from '@angular/core';

export const TOKEN2 = new InjectionToken<string>('TOKEN2');

@Component({ selector: 'app-untested-2', template: '<p>untested 2</p>' })
export class UntestedComponent2 {
  constructor(@Inject(TOKEN2) private readonly token: string) {}
}
`,
      'utf-8',
    );

    const plugins = angular({
      tsconfig: path.join(fixtureDir, 'tsconfig.json'),
      workspaceRoot: fixtureDir,
      fastCompile: true,
    });
    const fastCompilePlugin = plugins.find(
      (p) => (p as any)?.name === '@analogjs/vite-plugin-angular-fast-compile',
    ) as any;
    const sourcemapPlugin = plugins.find(
      (p) => (p as any)?.name === '@analogjs/vitest-angular-sourcemap-plugin',
    ) as any;

    await fastCompilePlugin.config(
      { root: fixtureDir, build: {} },
      { command: 'serve' },
    );

    vi.mocked(readConfiguration).mockClear();

    await sourcemapPlugin.transform(
      realFs.readFileSync(untestedComponentPath, 'utf-8'),
      untestedComponentPath,
    );
    await sourcemapPlugin.transform(
      realFs.readFileSync(secondUntestedComponentPath, 'utf-8'),
      secondUntestedComponentPath,
    );

    expect(readConfiguration).toHaveBeenCalledTimes(1);
  });

  // Regression: the *default* (non-`fastCompile`) compilation strategy has
  // its own `configureServer` watcher that only invalidated
  // `vitestFallbackCompilerOptions` (via `invalidateTsconfigCaches`) for a
  // file whose path contains `tsconfig` — an `extends` target under any
  // other name, which TypeScript allows (e.g. `compiler-options.json`),
  // left this cache stale until restart even though the main compilation
  // program's own tsconfig cache has the identical problem.
  it('invalidates the cached tsconfig when an arbitrarily named extended config changes (default strategy)', async () => {
    const plugins = angular({
      tsconfig: path.join(fixtureDir, 'tsconfig.json'),
      workspaceRoot: fixtureDir,
    });
    const mainPlugin = plugins.find(
      (p) => p.name === '@analogjs/vite-plugin-angular',
    ) as any;
    const sourcemapPlugin = plugins.find(
      (p) => p.name === '@analogjs/vitest-angular-sourcemap-plugin',
    ) as any;

    await mainPlugin.config(
      { root: fixtureDir, build: {} },
      { command: 'serve' },
    );
    const resolvedConfig = await resolveConfig(
      { configFile: false, root: fixtureDir, mode: 'test' },
      'serve',
    );
    mainPlugin.configResolved(resolvedConfig);

    const ctx = {
      environment: { config: resolvedConfig },
      warn: vi.fn(),
      error: vi.fn(),
      addWatchFile: vi.fn(),
    };
    await mainPlugin.buildStart.call(ctx);

    const untestedCode = realFs.readFileSync(untestedComponentPath, 'utf-8');
    vi.mocked(readConfiguration).mockClear();

    await sourcemapPlugin.transform(untestedCode, untestedComponentPath);
    expect(readConfiguration).toHaveBeenCalledTimes(1);

    const watchers = new Map<string, (file: string) => void>();
    mainPlugin.configureServer({
      watcher: {
        add: () => {
          /* not exercised by this test */
        },
        on: (event: string, handler: (file: string) => void) =>
          watchers.set(event, handler),
      },
    });
    watchers.get('change')?.(
      normalizePath(path.join(fixtureDir, 'compiler-options.json')),
    );

    await sourcemapPlugin.transform(untestedCode, untestedComponentPath);
    expect(readConfiguration).toHaveBeenCalledTimes(2);

    await mainPlugin.buildEnd.call(ctx);
  });

  // Regression: many editors save atomically (unlink then add a new
  // inode at the same path) rather than emitting a single `'change'` —
  // the invalidation above must react the same way to that shape too, or
  // an atomically-replaced, arbitrarily-named extended config leaves
  // `vitestFallbackCompilerOptions` silently stale.
  it('invalidates the cached tsconfig on an atomic-save unlink/add of an arbitrarily named extended config (default strategy)', async () => {
    const plugins = angular({
      tsconfig: path.join(fixtureDir, 'tsconfig.json'),
      workspaceRoot: fixtureDir,
    });
    const mainPlugin = plugins.find(
      (p) => p.name === '@analogjs/vite-plugin-angular',
    ) as any;
    const sourcemapPlugin = plugins.find(
      (p) => p.name === '@analogjs/vitest-angular-sourcemap-plugin',
    ) as any;

    await mainPlugin.config(
      { root: fixtureDir, build: {} },
      { command: 'serve' },
    );
    const resolvedConfig = await resolveConfig(
      { configFile: false, root: fixtureDir, mode: 'test' },
      'serve',
    );
    mainPlugin.configResolved(resolvedConfig);

    const ctx = {
      environment: { config: resolvedConfig },
      warn: vi.fn(),
      error: vi.fn(),
      addWatchFile: vi.fn(),
    };
    await mainPlugin.buildStart.call(ctx);

    const untestedCode = realFs.readFileSync(untestedComponentPath, 'utf-8');
    vi.mocked(readConfiguration).mockClear();

    await sourcemapPlugin.transform(untestedCode, untestedComponentPath);
    expect(readConfiguration).toHaveBeenCalledTimes(1);

    const watchers = new Map<string, (file: string) => void>();
    mainPlugin.configureServer({
      watcher: {
        add: () => {
          /* not exercised by this test */
        },
        on: (event: string, handler: (file: string) => void) =>
          watchers.set(event, handler),
      },
    });

    const arbitraryConfigPath = normalizePath(
      path.join(fixtureDir, 'compiler-options.json'),
    );
    watchers.get('unlink')?.(arbitraryConfigPath);
    watchers.get('add')?.(arbitraryConfigPath);

    await sourcemapPlugin.transform(untestedCode, untestedComponentPath);
    expect(readConfiguration).toHaveBeenCalledTimes(2);

    await mainPlugin.buildEnd.call(ctx);
  });

  // Regression: an `extends` target can use a JSON-family extension other
  // than `.json` (`.jsonc`) or none at all — a name/extension heuristic
  // alone can't recognize every one, but a file already known to be part
  // of the resolved chain (as this one is, once `configureServer` first
  // resolves it) reacts regardless of its own name.
  it('invalidates the cached tsconfig when a .jsonc extended config changes (default strategy)', async () => {
    const baseJsoncPath = path.join(fixtureDir, 'tsconfig.base.jsonc');
    realFs.writeFileSync(
      baseJsoncPath,
      JSON.stringify({ compilerOptions: {} }),
      'utf-8',
    );
    realFs.writeFileSync(
      path.join(fixtureDir, 'tsconfig.json'),
      JSON.stringify({
        extends: './tsconfig.base.jsonc',
        compilerOptions: {
          target: 'ES2022',
          module: 'ES2022',
          moduleResolution: 'bundler',
          experimentalDecorators: true,
          skipLibCheck: true,
          types: [],
        },
        files: ['src/app.component.ts'],
      }),
      'utf-8',
    );

    const plugins = angular({
      tsconfig: path.join(fixtureDir, 'tsconfig.json'),
      workspaceRoot: fixtureDir,
    });
    const mainPlugin = plugins.find(
      (p) => p.name === '@analogjs/vite-plugin-angular',
    ) as any;
    const sourcemapPlugin = plugins.find(
      (p) => p.name === '@analogjs/vitest-angular-sourcemap-plugin',
    ) as any;

    await mainPlugin.config(
      { root: fixtureDir, build: {} },
      { command: 'serve' },
    );
    const resolvedConfig = await resolveConfig(
      { configFile: false, root: fixtureDir, mode: 'test' },
      'serve',
    );
    mainPlugin.configResolved(resolvedConfig);

    const ctx = {
      environment: { config: resolvedConfig },
      warn: vi.fn(),
      error: vi.fn(),
      addWatchFile: vi.fn(),
    };
    await mainPlugin.buildStart.call(ctx);

    const untestedCode = realFs.readFileSync(untestedComponentPath, 'utf-8');
    vi.mocked(readConfiguration).mockClear();

    await sourcemapPlugin.transform(untestedCode, untestedComponentPath);
    expect(readConfiguration).toHaveBeenCalledTimes(1);

    const watchers = new Map<string, (file: string) => void>();
    mainPlugin.configureServer({
      watcher: {
        add: () => {
          /* not exercised by this test */
        },
        on: (event: string, handler: (file: string) => void) =>
          watchers.set(event, handler),
      },
    });

    watchers.get('change')?.(normalizePath(baseJsoncPath));

    await sourcemapPlugin.transform(untestedCode, untestedComponentPath);
    expect(readConfiguration).toHaveBeenCalledTimes(2);

    await mainPlugin.buildEnd.call(ctx);
  });

  // Regression: a real atomic-save unlink briefly makes the `.jsonc`
  // extended config genuinely not exist on disk. If that momentary
  // absence were treated as "this target doesn't exist" and used to
  // re-resolve the chain right then, `resolveExtendsTarget`'s existence
  // check would guess a wrong, `.json`-appended path in its place —
  // losing the real one before the paired `'add'` for the same save
  // ever arrives to restore it. A later edit to the real file would then
  // go unrecognized. This physically removes and recreates the file
  // (not just simulated events) to reproduce the exact race.
  it('does not lose a .jsonc extended config from the watched chain across a real atomic-save unlink/add cycle (default strategy)', async () => {
    const baseJsoncPath = path.join(fixtureDir, 'tsconfig.base.jsonc');
    realFs.writeFileSync(
      baseJsoncPath,
      JSON.stringify({ compilerOptions: {} }),
      'utf-8',
    );
    realFs.writeFileSync(
      path.join(fixtureDir, 'tsconfig.json'),
      JSON.stringify({
        extends: './tsconfig.base.jsonc',
        compilerOptions: {
          target: 'ES2022',
          module: 'ES2022',
          moduleResolution: 'bundler',
          experimentalDecorators: true,
          skipLibCheck: true,
          types: [],
        },
        files: ['src/app.component.ts'],
      }),
      'utf-8',
    );

    const plugins = angular({
      tsconfig: path.join(fixtureDir, 'tsconfig.json'),
      workspaceRoot: fixtureDir,
    });
    const mainPlugin = plugins.find(
      (p) => p.name === '@analogjs/vite-plugin-angular',
    ) as any;
    const sourcemapPlugin = plugins.find(
      (p) => p.name === '@analogjs/vitest-angular-sourcemap-plugin',
    ) as any;

    await mainPlugin.config(
      { root: fixtureDir, build: {} },
      { command: 'serve' },
    );
    const resolvedConfig = await resolveConfig(
      { configFile: false, root: fixtureDir, mode: 'test' },
      'serve',
    );
    mainPlugin.configResolved(resolvedConfig);

    const ctx = {
      environment: { config: resolvedConfig },
      warn: vi.fn(),
      error: vi.fn(),
      addWatchFile: vi.fn(),
    };
    await mainPlugin.buildStart.call(ctx);

    const untestedCode = realFs.readFileSync(untestedComponentPath, 'utf-8');
    vi.mocked(readConfiguration).mockClear();

    await sourcemapPlugin.transform(untestedCode, untestedComponentPath);
    expect(readConfiguration).toHaveBeenCalledTimes(1);

    const watchers = new Map<string, (file: string) => void>();
    mainPlugin.configureServer({
      watcher: {
        add: () => {
          /* not exercised by this test */
        },
        on: (event: string, handler: (file: string) => void) =>
          watchers.set(event, handler),
      },
    });

    const normalizedBaseJsoncPath = normalizePath(baseJsoncPath);

    // Physically remove the file — genuinely missing, not simulated.
    realFs.unlinkSync(baseJsoncPath);
    watchers.get('unlink')?.(normalizedBaseJsoncPath);

    // A cache read *between* the unlink and the add — the cache is still
    // invalidated even mid-atomic-save.
    await sourcemapPlugin.transform(untestedCode, untestedComponentPath);
    expect(readConfiguration).toHaveBeenCalledTimes(2);

    // Physically recreate it, completing the atomic save.
    realFs.writeFileSync(
      baseJsoncPath,
      JSON.stringify({ compilerOptions: {} }),
      'utf-8',
    );
    watchers.get('add')?.(normalizedBaseJsoncPath);

    // The real assertion: a *later*, ordinary edit to the same file must
    // still be recognized as a chain member — proving the unlink didn't
    // corrupt the chain with a guessed, wrong path in its place.
    watchers.get('change')?.(normalizedBaseJsoncPath);
    await sourcemapPlugin.transform(untestedCode, untestedComponentPath);
    expect(readConfiguration).toHaveBeenCalledTimes(3);

    await mainPlugin.buildEnd.call(ctx);
  });

  // Regression: `fastCompile` has no tsconfig-file watcher of its own — a
  // live edit to it during a watch session must still reach the cache
  // above (via `onTsconfigChanged`), or the fallback would keep serving
  // whatever settings were resolved when the session started.
  it('invalidates the cached tsconfig when fastCompile reports it changed', async () => {
    const tsconfigPath = path.join(fixtureDir, 'tsconfig.json');
    const plugins = angular({
      tsconfig: tsconfigPath,
      workspaceRoot: fixtureDir,
      fastCompile: true,
    });
    const fastCompilePlugin = plugins.find(
      (p) => (p as any)?.name === '@analogjs/vite-plugin-angular-fast-compile',
    ) as any;
    const sourcemapPlugin = plugins.find(
      (p) => (p as any)?.name === '@analogjs/vitest-angular-sourcemap-plugin',
    ) as any;

    await fastCompilePlugin.config(
      { root: fixtureDir, build: {} },
      { command: 'serve' },
    );

    vi.mocked(readConfiguration).mockClear();

    const untestedCode = realFs.readFileSync(untestedComponentPath, 'utf-8');
    await sourcemapPlugin.transform(untestedCode, untestedComponentPath);
    await sourcemapPlugin.transform(untestedCode, untestedComponentPath);
    expect(readConfiguration).toHaveBeenCalledTimes(1);

    await fastCompilePlugin.handleHotUpdate({
      file: normalizePath(tsconfigPath),
      modules: [],
      server: {
        watcher: {
          add: () => {
            /* not exercised by this test */
          },
        },
        moduleGraph: { getModuleById: () => undefined },
      },
    });

    await sourcemapPlugin.transform(untestedCode, untestedComponentPath);
    expect(readConfiguration).toHaveBeenCalledTimes(2);
  });

  // Regression: same gap as the default strategy's own `configureServer`
  // (above) — `fastCompile`'s watcher only observes its project root and a
  // handful of config dependencies by default, so an `extends` target
  // outside that root would never reach `handleHotUpdate` to invalidate
  // the cache tested above.
  it('watches the tsconfig extends chain explicitly, not just the leaf (fastCompile)', async () => {
    const baseTsconfigPath = path.join(fixtureDir, 'tsconfig.base.json');
    realFs.writeFileSync(
      baseTsconfigPath,
      JSON.stringify({ compilerOptions: {} }),
      'utf-8',
    );
    const tsconfigPath = path.join(fixtureDir, 'tsconfig.json');
    realFs.writeFileSync(
      tsconfigPath,
      JSON.stringify({
        extends: './tsconfig.base.json',
        compilerOptions: {
          target: 'ES2022',
          module: 'ES2022',
          moduleResolution: 'bundler',
          experimentalDecorators: true,
          skipLibCheck: true,
          types: [],
        },
        files: ['src/app.component.ts'],
      }),
      'utf-8',
    );

    const plugins = angular({
      tsconfig: tsconfigPath,
      workspaceRoot: fixtureDir,
      fastCompile: true,
    });
    const fastCompilePlugin = plugins.find(
      (p) => (p as any)?.name === '@analogjs/vite-plugin-angular-fast-compile',
    ) as any;

    await fastCompilePlugin.config(
      { root: fixtureDir, build: {} },
      { command: 'serve' },
    );

    const watchedPaths: string[] = [];
    fastCompilePlugin.configureServer({
      watcher: {
        add: (p: string) => watchedPaths.push(normalizePath(p)),
        on: () => {
          /* not exercised by this test */
        },
      },
    });

    expect(watchedPaths).toContain(normalizePath(tsconfigPath));
    expect(watchedPaths).toContain(normalizePath(baseTsconfigPath));
  });

  // Regression: same gap as the default strategy's own equivalent test
  // above — the chain is only known at the moment it's first resolved,
  // so an edit that points `extends` at a *different* file must
  // re-resolve the chain through `handleHotUpdate` and start watching the
  // new target too.
  it('starts watching a newly introduced extends target after a tsconfig edit (fastCompile)', async () => {
    const originalBasePath = path.join(
      fixtureDir,
      'tsconfig.original-base.json',
    );
    realFs.writeFileSync(
      originalBasePath,
      JSON.stringify({ compilerOptions: {} }),
      'utf-8',
    );
    const tsconfigPath = path.join(fixtureDir, 'tsconfig.json');
    const compilerOptions = {
      target: 'ES2022',
      module: 'ES2022',
      moduleResolution: 'bundler',
      experimentalDecorators: true,
      skipLibCheck: true,
      types: [],
    };
    realFs.writeFileSync(
      tsconfigPath,
      JSON.stringify({
        extends: './tsconfig.original-base.json',
        compilerOptions,
        files: ['src/app.component.ts'],
      }),
      'utf-8',
    );

    const plugins = angular({
      tsconfig: tsconfigPath,
      workspaceRoot: fixtureDir,
      fastCompile: true,
    });
    const fastCompilePlugin = plugins.find(
      (p) => (p as any)?.name === '@analogjs/vite-plugin-angular-fast-compile',
    ) as any;

    await fastCompilePlugin.config(
      { root: fixtureDir, build: {} },
      { command: 'serve' },
    );

    const watchedPaths: string[] = [];
    fastCompilePlugin.configureServer({
      watcher: {
        add: (p: string) => watchedPaths.push(normalizePath(p)),
        on: () => {
          /* not exercised by this test */
        },
      },
    });

    expect(watchedPaths).toContain(normalizePath(originalBasePath));

    const newBasePath = path.join(fixtureDir, 'tsconfig.new-base.json');
    realFs.writeFileSync(
      newBasePath,
      JSON.stringify({ compilerOptions: {} }),
      'utf-8',
    );
    realFs.writeFileSync(
      tsconfigPath,
      JSON.stringify({
        extends: './tsconfig.new-base.json',
        compilerOptions,
        files: ['src/app.component.ts'],
      }),
      'utf-8',
    );

    await fastCompilePlugin.handleHotUpdate({
      file: normalizePath(tsconfigPath),
      modules: [],
      server: {
        watcher: { add: (p: string) => watchedPaths.push(normalizePath(p)) },
        moduleGraph: { getModuleById: () => undefined },
      },
    });

    expect(watchedPaths).toContain(normalizePath(newBasePath));
  });

  // Regression: `readConfiguration` follows an `extends` chain, so a
  // parent config (e.g. `tsconfig.base.json`) can supply the very
  // decorator/target/class-field/JSX settings this fallback relies on.
  // `fastCompile` has no way to enumerate that chain's member files, so
  // invalidation has to react to any `.json` edit, not only the exact
  // leaf path this project resolved or names shaped like `tsconfig*.json`
  // — TypeScript doesn't require an `extends` target to look like one.
  it('invalidates the cached tsconfig when an extended config file changes', async () => {
    const tsconfigPath = path.join(fixtureDir, 'tsconfig.json');
    const baseTsconfigPath = path.join(fixtureDir, 'tsconfig.base.json');
    const plugins = angular({
      tsconfig: tsconfigPath,
      workspaceRoot: fixtureDir,
      fastCompile: true,
    });
    const fastCompilePlugin = plugins.find(
      (p) => (p as any)?.name === '@analogjs/vite-plugin-angular-fast-compile',
    ) as any;
    const sourcemapPlugin = plugins.find(
      (p) => (p as any)?.name === '@analogjs/vitest-angular-sourcemap-plugin',
    ) as any;

    await fastCompilePlugin.config(
      { root: fixtureDir, build: {} },
      { command: 'serve' },
    );

    vi.mocked(readConfiguration).mockClear();

    const untestedCode = realFs.readFileSync(untestedComponentPath, 'utf-8');
    await sourcemapPlugin.transform(untestedCode, untestedComponentPath);
    expect(readConfiguration).toHaveBeenCalledTimes(1);

    // Not the leaf tsconfig this project resolved — a sibling base config
    // an `extends` chain could pull settings from.
    await fastCompilePlugin.handleHotUpdate({
      file: normalizePath(baseTsconfigPath),
      modules: [],
      server: {
        watcher: {
          add: () => {
            /* not exercised by this test */
          },
        },
        moduleGraph: { getModuleById: () => undefined },
      },
    });

    await sourcemapPlugin.transform(untestedCode, untestedComponentPath);
    expect(readConfiguration).toHaveBeenCalledTimes(2);
  });

  // Regression: TypeScript doesn't require an `extends` target's
  // filename to look like a tsconfig at all (e.g.
  // `"extends": "./compiler-options.json"`), so matching on a
  // `tsconfig*.json`-shaped name would miss it and keep serving stale
  // settings until restart.
  it('invalidates the cached tsconfig when an arbitrarily named extended config changes', async () => {
    const tsconfigPath = path.join(fixtureDir, 'tsconfig.json');
    const arbitraryConfigPath = path.join(fixtureDir, 'compiler-options.json');
    const plugins = angular({
      tsconfig: tsconfigPath,
      workspaceRoot: fixtureDir,
      fastCompile: true,
    });
    const fastCompilePlugin = plugins.find(
      (p) => (p as any)?.name === '@analogjs/vite-plugin-angular-fast-compile',
    ) as any;
    const sourcemapPlugin = plugins.find(
      (p) => (p as any)?.name === '@analogjs/vitest-angular-sourcemap-plugin',
    ) as any;

    await fastCompilePlugin.config(
      { root: fixtureDir, build: {} },
      { command: 'serve' },
    );

    vi.mocked(readConfiguration).mockClear();

    const untestedCode = realFs.readFileSync(untestedComponentPath, 'utf-8');
    await sourcemapPlugin.transform(untestedCode, untestedComponentPath);
    expect(readConfiguration).toHaveBeenCalledTimes(1);

    await fastCompilePlugin.handleHotUpdate({
      file: normalizePath(arbitraryConfigPath),
      modules: [],
      server: {
        watcher: {
          add: () => {
            /* not exercised by this test */
          },
        },
        moduleGraph: { getModuleById: () => undefined },
      },
    });

    await sourcemapPlugin.transform(untestedCode, untestedComponentPath);
    expect(readConfiguration).toHaveBeenCalledTimes(2);
  });

  // Regression: same atomic-save gap as the default strategy's own
  // equivalent test above — `handleHotUpdate` only fires for a genuine
  // `'change'` event, so an editor that replaces a file via unlink+add
  // needs its own reaction through the fast-compile-specific
  // `configureServer` watcher, or it leaves
  // `vitestFallbackCompilerOptions` silently stale.
  it('invalidates the cached tsconfig on an atomic-save unlink/add of an arbitrarily named extended config (fastCompile)', async () => {
    const tsconfigPath = path.join(fixtureDir, 'tsconfig.json');
    const plugins = angular({
      tsconfig: tsconfigPath,
      workspaceRoot: fixtureDir,
      fastCompile: true,
    });
    const fastCompilePlugin = plugins.find(
      (p) => (p as any)?.name === '@analogjs/vite-plugin-angular-fast-compile',
    ) as any;
    const sourcemapPlugin = plugins.find(
      (p) => (p as any)?.name === '@analogjs/vitest-angular-sourcemap-plugin',
    ) as any;

    await fastCompilePlugin.config(
      { root: fixtureDir, build: {} },
      { command: 'serve' },
    );

    vi.mocked(readConfiguration).mockClear();

    const untestedCode = realFs.readFileSync(untestedComponentPath, 'utf-8');
    await sourcemapPlugin.transform(untestedCode, untestedComponentPath);
    expect(readConfiguration).toHaveBeenCalledTimes(1);

    const watchers = new Map<string, (file: string) => void | Promise<void>>();
    fastCompilePlugin.configureServer({
      watcher: {
        add: () => {
          /* not exercised by this test */
        },
        on: (event: string, handler: (file: string) => void | Promise<void>) =>
          watchers.set(event, handler),
      },
    });

    const arbitraryConfigPath = normalizePath(
      path.join(fixtureDir, 'compiler-options.json'),
    );
    await watchers.get('unlink')?.(arbitraryConfigPath);
    await watchers.get('add')?.(arbitraryConfigPath);

    await sourcemapPlugin.transform(untestedCode, untestedComponentPath);
    expect(readConfiguration).toHaveBeenCalledTimes(2);
  });

  // Regression: same gap as the default strategy's own equivalent test
  // above — an `extends` target can use a JSON-family extension other
  // than `.json` (`.jsonc`), which a name/extension heuristic alone
  // can't recognize, but chain membership does once `configureServer`
  // first resolves it.
  it('invalidates the cached tsconfig when a .jsonc extended config changes (fastCompile)', async () => {
    const baseJsoncPath = path.join(fixtureDir, 'tsconfig.base.jsonc');
    realFs.writeFileSync(
      baseJsoncPath,
      JSON.stringify({ compilerOptions: {} }),
      'utf-8',
    );
    const tsconfigPath = path.join(fixtureDir, 'tsconfig.json');
    realFs.writeFileSync(
      tsconfigPath,
      JSON.stringify({
        extends: './tsconfig.base.jsonc',
        compilerOptions: {
          target: 'ES2022',
          module: 'ES2022',
          moduleResolution: 'bundler',
          experimentalDecorators: true,
          skipLibCheck: true,
          types: [],
        },
        files: ['src/app.component.ts'],
      }),
      'utf-8',
    );

    const plugins = angular({
      tsconfig: tsconfigPath,
      workspaceRoot: fixtureDir,
      fastCompile: true,
    });
    const fastCompilePlugin = plugins.find(
      (p) => (p as any)?.name === '@analogjs/vite-plugin-angular-fast-compile',
    ) as any;
    const sourcemapPlugin = plugins.find(
      (p) => (p as any)?.name === '@analogjs/vitest-angular-sourcemap-plugin',
    ) as any;

    await fastCompilePlugin.config(
      { root: fixtureDir, build: {} },
      { command: 'serve' },
    );

    const watchedPaths: string[] = [];
    fastCompilePlugin.configureServer({
      watcher: {
        add: (p: string) => watchedPaths.push(normalizePath(p)),
        on: () => {
          /* not exercised by this test */
        },
      },
    });
    expect(watchedPaths).toContain(normalizePath(baseJsoncPath));

    vi.mocked(readConfiguration).mockClear();

    const untestedCode = realFs.readFileSync(untestedComponentPath, 'utf-8');
    await sourcemapPlugin.transform(untestedCode, untestedComponentPath);
    expect(readConfiguration).toHaveBeenCalledTimes(1);

    await fastCompilePlugin.handleHotUpdate({
      file: normalizePath(baseJsoncPath),
      modules: [],
      server: {
        watcher: {
          add: () => {
            /* not exercised by this test */
          },
        },
        moduleGraph: { getModuleById: () => undefined },
      },
    });

    await sourcemapPlugin.transform(untestedCode, untestedComponentPath);
    expect(readConfiguration).toHaveBeenCalledTimes(2);
  });

  // Regression: same real atomic-save race as the default strategy's own
  // equivalent test above — a physically unlinked `.jsonc` extended
  // config must not corrupt the watched chain before the paired `'add'`
  // for the same save restores it, or a later edit to the real file goes
  // unrecognized.
  it('does not lose a .jsonc extended config from the watched chain across a real atomic-save unlink/add cycle (fastCompile)', async () => {
    const baseJsoncPath = path.join(fixtureDir, 'tsconfig.base.jsonc');
    realFs.writeFileSync(
      baseJsoncPath,
      JSON.stringify({ compilerOptions: {} }),
      'utf-8',
    );
    const tsconfigPath = path.join(fixtureDir, 'tsconfig.json');
    realFs.writeFileSync(
      tsconfigPath,
      JSON.stringify({
        extends: './tsconfig.base.jsonc',
        compilerOptions: {
          target: 'ES2022',
          module: 'ES2022',
          moduleResolution: 'bundler',
          experimentalDecorators: true,
          skipLibCheck: true,
          types: [],
        },
        files: ['src/app.component.ts'],
      }),
      'utf-8',
    );

    const plugins = angular({
      tsconfig: tsconfigPath,
      workspaceRoot: fixtureDir,
      fastCompile: true,
    });
    const fastCompilePlugin = plugins.find(
      (p) => (p as any)?.name === '@analogjs/vite-plugin-angular-fast-compile',
    ) as any;
    const sourcemapPlugin = plugins.find(
      (p) => (p as any)?.name === '@analogjs/vitest-angular-sourcemap-plugin',
    ) as any;

    await fastCompilePlugin.config(
      { root: fixtureDir, build: {} },
      { command: 'serve' },
    );

    const watchers = new Map<string, (file: string) => void | Promise<void>>();
    fastCompilePlugin.configureServer({
      watcher: {
        add: () => {
          /* not exercised by this test */
        },
        on: (event: string, handler: (file: string) => void | Promise<void>) =>
          watchers.set(event, handler),
      },
    });

    vi.mocked(readConfiguration).mockClear();

    const untestedCode = realFs.readFileSync(untestedComponentPath, 'utf-8');
    await sourcemapPlugin.transform(untestedCode, untestedComponentPath);
    expect(readConfiguration).toHaveBeenCalledTimes(1);

    const normalizedBaseJsoncPath = normalizePath(baseJsoncPath);
    const fakeServer = {
      watcher: {
        add: () => {
          /* not exercised by this test */
        },
      },
      moduleGraph: { getModuleById: () => undefined },
    };

    // Physically remove the file — genuinely missing, not simulated.
    realFs.unlinkSync(baseJsoncPath);
    await watchers.get('unlink')?.(normalizedBaseJsoncPath);

    // A cache read *between* the unlink and the add.
    await sourcemapPlugin.transform(untestedCode, untestedComponentPath);
    expect(readConfiguration).toHaveBeenCalledTimes(2);

    // Physically recreate it, completing the atomic save.
    realFs.writeFileSync(
      baseJsoncPath,
      JSON.stringify({ compilerOptions: {} }),
      'utf-8',
    );
    await watchers.get('add')?.(normalizedBaseJsoncPath);

    // The real assertion: a *later*, ordinary edit to the same file must
    // still be recognized as a chain member.
    await fastCompilePlugin.handleHotUpdate({
      file: normalizedBaseJsoncPath,
      modules: [],
      server: fakeServer,
    });
    await sourcemapPlugin.transform(untestedCode, untestedComponentPath);
    expect(readConfiguration).toHaveBeenCalledTimes(3);
  });

  // Control: a non-JSON edit (e.g. a component's own source) isn't
  // treated as a possible config dependency and shouldn't force a
  // spurious re-read on every unrelated file change.
  it('does not invalidate the cached tsconfig for an unrelated source file change', async () => {
    const tsconfigPath = path.join(fixtureDir, 'tsconfig.json');
    const plugins = angular({
      tsconfig: tsconfigPath,
      workspaceRoot: fixtureDir,
      fastCompile: true,
    });
    const fastCompilePlugin = plugins.find(
      (p) => (p as any)?.name === '@analogjs/vite-plugin-angular-fast-compile',
    ) as any;
    const sourcemapPlugin = plugins.find(
      (p) => (p as any)?.name === '@analogjs/vitest-angular-sourcemap-plugin',
    ) as any;

    await fastCompilePlugin.config(
      { root: fixtureDir, build: {} },
      { command: 'serve' },
    );

    vi.mocked(readConfiguration).mockClear();

    const untestedCode = realFs.readFileSync(untestedComponentPath, 'utf-8');
    await sourcemapPlugin.transform(untestedCode, untestedComponentPath);
    expect(readConfiguration).toHaveBeenCalledTimes(1);

    await fastCompilePlugin.handleHotUpdate({
      file: untestedComponentPath,
      modules: [],
      server: {
        watcher: {
          add: () => {
            /* not exercised by this test */
          },
        },
        moduleGraph: { getModuleById: () => undefined },
      },
    });

    await sourcemapPlugin.transform(untestedCode, untestedComponentPath);
    expect(readConfiguration).toHaveBeenCalledTimes(1);
  });
});
