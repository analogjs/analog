import * as path from 'node:path';
import * as realFs from 'node:fs';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { normalizePath, preprocessCSS } from 'vite';

vi.mock('vite', async () => {
  const actual = await vi.importActual<typeof import('vite')>('vite');
  return {
    ...actual,
    preprocessCSS: vi.fn(async (code: string) => ({ code, deps: new Set() })),
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
  mapTemplateUpdatesToFiles,
  toAngularCompilationFileReplacements,
  isTestWatchMode,
} from './angular-vite-plugin';
import type { EmitFileResult } from './models';

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
    invalidate('/project/src/app/types.d.ts');
    invalidate('/project/src/app/data.json');
    await vi.runAllTimersAsync();

    expect(invalidateFsCaches).not.toHaveBeenCalled();
    expect(invalidateTsconfigCaches).not.toHaveBeenCalled();
    expect(performCompilation).not.toHaveBeenCalled();
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
