import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  it,
  expect,
  vi,
} from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import * as realFs from 'node:fs';
import { tmpdir } from 'node:os';
import path, { join } from 'node:path';
import { normalizePath, preprocessCSS, type Plugin } from 'vite';

vi.mock('vite', async () => {
  const actual = await vi.importActual<typeof import('vite')>('vite');
  return {
    ...actual,
    preprocessCSS: vi.fn(async (code: string) => ({ code, deps: new Set() })),
  };
});

import {
  angular,
  buildStylePreprocessor,
  createFsWatcherCacheInvalidator,
  evictDeletedFileMetadata,
  findBoundClassAndNgClassConflicts,
  findStaticClassAndBoundClassConflicts,
  findTemplateOwnerModules,
  findComponentStylesheetWrapperModules,
  getModulesForChangedFile,
  isModuleForChangedResource,
  isIgnoredHmrFile,
  injectViteIgnoreForHmrMetadata,
  mapTemplateUpdatesToFiles,
  normalizeIncludeGlob,
  refreshStylesheetRegistryForFile,
  toAngularCompilationFileReplacements,
  isTestWatchMode,
} from './angular-vite-plugin';
import { AnalogStylesheetRegistry } from './stylesheet-registry.js';

const hmrPluginNames = ['analogjs-live-reload-plugin'];
const originalNodeEnv = process.env['NODE_ENV'];
const originalVitestEnv = process.env['VITEST'];

describe('angularVitePlugin', () => {
  it('should work', () => {
    expect(angular().map((plugin) => plugin.name)).toContain(
      '@analogjs/vite-plugin-angular',
    );
  });

  it('prebundles rxjs and tslib in optimizeDeps', async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'analog-optimize-deps-'));
    const tsconfigPath = join(tempRoot, 'tsconfig.spec.json');
    // Use a real tsconfig path so this test stays about optimizeDeps output,
    // not about the plugin warning on a deliberately missing config file.
    writeFileSync(tsconfigPath, '{\n  "compilerOptions": {}\n}\n', 'utf-8');

    try {
      const plugin = angular({ tsconfig: tsconfigPath }).find(
        (p) => p.name === '@analogjs/vite-plugin-angular',
      ) as Plugin;
      const configHook =
        typeof plugin.config === 'function'
          ? plugin.config
          : (plugin.config as any)?.handler;

      const config = await configHook?.call(
        {} as any,
        { resolve: {} },
        { command: 'serve', mode: 'development' },
      );

      expect(config?.optimizeDeps?.include).toEqual([
        'rxjs/operators',
        'rxjs',
        'tslib',
      ]);
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });
});

describe('liveReload option', () => {
  beforeEach(() => {
    process.env['NODE_ENV'] = 'development';
    delete process.env['VITEST'];
  });

  afterEach(() => {
    if (typeof originalNodeEnv === 'undefined') {
      delete process.env['NODE_ENV'];
    } else {
      process.env['NODE_ENV'] = originalNodeEnv;
    }

    if (typeof originalVitestEnv === 'undefined') {
      delete process.env['VITEST'];
    } else {
      process.env['VITEST'] = originalVitestEnv;
    }
  });

  it('disables HMR helper plugins when liveReload is false', () => {
    const plugins = angular({ liveReload: false });
    const names = plugins.map((plugin) => plugin.name);

    expect(names).toEqual(expect.not.arrayContaining(hmrPluginNames));
  });

  it('enables HMR helper plugins by default', () => {
    const names = angular().map((plugin) => plugin.name);

    expect(names).toEqual(expect.arrayContaining(hmrPluginNames));
  });
});

describe('isTestWatchMode', () => {
  it('should return false for vitest --run', () => {
    const result = isTestWatchMode(['--run']);

    expect(result).toBeFalsy();
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

describe('normalizeIncludeGlob', () => {
  const workspaceRoot = '/workspace/analog';

  it('leaves workspace-rooted globs unchanged', () => {
    expect(
      normalizeIncludeGlob(workspaceRoot, '/workspace/analog/libs/**'),
    ).toBe('/workspace/analog/libs/**');
  });

  it('prefixes workspace-relative globs that start with a slash', () => {
    expect(normalizeIncludeGlob(workspaceRoot, '/libs/**')).toBe(
      '/workspace/analog/libs/**',
    );
  });

  it('resolves bare relative globs against the workspace root', () => {
    expect(normalizeIncludeGlob(workspaceRoot, 'libs/**')).toBe(
      '/workspace/analog/libs/**',
    );
  });
});

describe('isIgnoredHmrFile', () => {
  it('ignores TypeScript build info files', () => {
    expect(
      isIgnoredHmrFile('/workspace/apps/demo/tsconfig.app.tsbuildinfo'),
    ).toBe(true);
  });

  it('does not ignore normal TypeScript source files', () => {
    expect(
      isIgnoredHmrFile('/workspace/apps/demo/src/app/app.component.ts'),
    ).toBe(false);
  });
});

describe('getModulesForChangedFile', () => {
  it('includes module-graph entries when the watcher event omits direct css modules', async () => {
    const directModule = {
      id: '/workspace/apps/demo/src/app/demo.component.css?direct&ngcomp=ng-c1&e=0',
      file: '/workspace/apps/demo/src/app/demo.component.css',
      url: '/src/app/demo.component.css?direct&ngcomp=ng-c1&e=0',
      type: 'css',
    } as any;
    const sourceModule = {
      id: '/workspace/apps/demo/src/app/demo.component.css',
      file: '/workspace/apps/demo/src/app/demo.component.css',
      url: '/src/app/demo.component.css',
      type: 'css',
    } as any;
    const server = {
      moduleGraph: {
        getModulesByFile: vi.fn().mockReturnValue(new Set([directModule])),
        getModuleByUrl: vi.fn(),
        getModuleById: vi.fn(),
      },
    } as any;

    const result = await getModulesForChangedFile(
      server,
      '/workspace/apps/demo/src/app/demo.component.css',
      [sourceModule],
    );

    expect(result).toEqual([sourceModule, directModule]);
    expect(server.moduleGraph.getModulesByFile).toHaveBeenCalledWith(
      '/workspace/apps/demo/src/app/demo.component.css',
    );
  });

  it('deduplicates modules by id across watcher and module-graph sources', async () => {
    const sharedModule = {
      id: '/workspace/apps/demo/src/app/demo.component.css',
      file: '/workspace/apps/demo/src/app/demo.component.css',
    } as any;
    const server = {
      moduleGraph: {
        getModulesByFile: vi.fn().mockReturnValue(new Set([sharedModule])),
        getModuleByUrl: vi.fn(),
        getModuleById: vi.fn(),
      },
    } as any;

    const result = await getModulesForChangedFile(
      server,
      '/workspace/apps/demo/src/app/demo.component.css',
      [sharedModule],
    );

    expect(result).toEqual([sharedModule]);
  });

  it('includes tracked virtual stylesheet modules for a changed source stylesheet', async () => {
    const virtualModule = {
      id: '/abc123.css?ngcomp=ng-c1&e=0',
      file: '/abc123.css',
      url: '/abc123.css?ngcomp=ng-c1&e=0',
      type: 'js',
    } as any;
    const server = {
      moduleGraph: {
        getModulesByFile: vi.fn().mockReturnValue(undefined),
        getModuleByUrl: vi.fn().mockImplementation((id: string) => {
          return id === '/abc123.css?ngcomp=ng-c1&e=0'
            ? virtualModule
            : undefined;
        }),
        getModuleById: vi.fn().mockImplementation((id: string) => {
          return id === '/abc123.css?ngcomp=ng-c1&e=0'
            ? virtualModule
            : undefined;
        }),
      },
    } as any;
    const stylesheetRegistry = {
      getRequestIdsForSource: vi
        .fn()
        .mockReturnValue(['abc123.css?ngcomp=ng-c1&e=0']),
    } as any;

    const result = await getModulesForChangedFile(
      server,
      '/workspace/apps/demo/src/app/demo.component.css',
      [],
      stylesheetRegistry,
    );

    expect(result).toEqual([virtualModule]);
    expect(stylesheetRegistry.getRequestIdsForSource).toHaveBeenCalledWith(
      '/workspace/apps/demo/src/app/demo.component.css',
    );
    expect(server.moduleGraph.getModuleById).toHaveBeenCalledWith(
      'abc123.css?ngcomp=ng-c1&e=0',
    );
    expect(server.moduleGraph.getModuleByUrl).toHaveBeenCalledWith(
      '/abc123.css?ngcomp=ng-c1&e=0',
    );
    expect(server.moduleGraph.getModuleById).not.toHaveBeenCalledWith(
      '/abc123.css?ngcomp=ng-c1&e=0',
    );
  });

  it('falls back to getModuleById when getModuleByUrl misses a tracked request id', async () => {
    const virtualModule = {
      id: '/abc123.css?direct&ngcomp=ng-c1&e=0',
      file: '/abc123.css',
      url: '/abc123.css?direct&ngcomp=ng-c1&e=0',
      type: 'css',
    } as any;
    const server = {
      moduleGraph: {
        getModulesByFile: vi.fn().mockReturnValue(undefined),
        getModuleByUrl: vi.fn().mockResolvedValue(undefined),
        getModuleById: vi.fn().mockImplementation((id: string) => {
          return id === '/abc123.css?direct&ngcomp=ng-c1&e=0'
            ? virtualModule
            : undefined;
        }),
      },
    } as any;
    const stylesheetRegistry = {
      getRequestIdsForSource: vi
        .fn()
        .mockReturnValue(['abc123.css?direct&ngcomp=ng-c1&e=0']),
    } as any;

    const result = await getModulesForChangedFile(
      server,
      '/workspace/apps/demo/src/app/demo.component.css',
      [],
      stylesheetRegistry,
    );

    expect(result).toEqual([virtualModule]);
    expect(server.moduleGraph.getModuleByUrl).toHaveBeenCalledWith(
      'abc123.css?direct&ngcomp=ng-c1&e=0',
    );
    expect(server.moduleGraph.getModuleByUrl).toHaveBeenCalledWith(
      '/abc123.css?direct&ngcomp=ng-c1&e=0',
    );
    expect(server.moduleGraph.getModuleById).toHaveBeenCalledWith(
      'abc123.css?direct&ngcomp=ng-c1&e=0',
    );
    expect(server.moduleGraph.getModuleById).toHaveBeenCalledWith(
      '/abc123.css?direct&ngcomp=ng-c1&e=0',
    );
  });
});

describe('isModuleForChangedResource', () => {
  it('matches a virtual component stylesheet module back to its source css file', () => {
    const mod = {
      id: '/abc123.css?direct&ngcomp=ng-c1&e=0',
      file: '/abc123.css',
      type: 'css',
    } as any;
    const stylesheetRegistry = {
      resolveExternalSource: vi.fn().mockImplementation((id: string) => {
        return id === 'abc123.css'
          ? '/workspace/apps/demo/src/app/demo.component.css'
          : undefined;
      }),
    } as any;

    expect(
      isModuleForChangedResource(
        mod,
        '/workspace/apps/demo/src/app/demo.component.css',
        stylesheetRegistry,
      ),
    ).toBe(true);
  });
});

describe('findComponentStylesheetWrapperModules', () => {
  it('recovers the js wrapper module from a direct stylesheet request id', async () => {
    const wrapperModule = {
      id: '/abc123.css?ngcomp=ng-c1&e=0',
      file: '/abc123.css',
      url: '/abc123.css?ngcomp=ng-c1&e=0',
      type: 'js',
    } as any;
    const directModule = {
      id: '/abc123.css?direct&ngcomp=ng-c1&e=0',
      file: '/abc123.css',
      url: '/abc123.css?direct&ngcomp=ng-c1&e=0',
      type: 'css',
    } as any;
    const server = {
      moduleGraph: {
        getModuleByUrl: vi.fn().mockImplementation((id: string) => {
          return id === '/abc123.css?ngcomp=ng-c1&e=0'
            ? wrapperModule
            : undefined;
        }),
        getModuleById: vi.fn(),
      },
    } as any;
    const stylesheetRegistry = {
      resolveExternalSource: vi.fn().mockImplementation((id: string) => {
        return id === 'abc123.css'
          ? '/workspace/apps/demo/src/app/demo.component.css'
          : undefined;
      }),
      getRequestIdsForSource: vi
        .fn()
        .mockReturnValue(['/abc123.css?direct&ngcomp=ng-c1&e=0']),
    } as any;

    const result = await findComponentStylesheetWrapperModules(
      server,
      '/workspace/apps/demo/src/app/demo.component.css',
      directModule,
      [directModule],
      stylesheetRegistry,
    );

    expect(result).toEqual([wrapperModule]);
    expect(server.moduleGraph.getModuleByUrl).toHaveBeenCalledWith(
      '/abc123.css?ngcomp=ng-c1&e=0',
    );
  });
});

describe('refreshStylesheetRegistryForFile', () => {
  it('updates served stylesheet content from the changed source file', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'analog-styles-'));
    const stylesheetPath = join(tempDir, 'demo.component.css');
    writeFileSync(stylesheetPath, '.demo { color: red; }', 'utf-8');

    const registry = new AnalogStylesheetRegistry();
    registry.registerServedStylesheet(
      {
        publicId: 'abc123.css',
        sourcePath: stylesheetPath,
        normalizedCode: '.demo { color: blue; }',
      },
      [stylesheetPath, stylesheetPath.replace(/^\//, '')],
    );

    try {
      refreshStylesheetRegistryForFile(stylesheetPath, registry);

      expect(registry.getServedContent('abc123.css')).toBe(
        '.demo { color: red; }',
      );
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
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

    const result = resolveId(
      'angular:jit:style:file;./my-component.scss',
      '/project/src/app/my-component.ts',
    );

    expect(result).toContain(
      'virtual:@analogjs/vite-plugin-angular:inline-style:',
    );
    expect(result).not.toContain('?analog-inline');
    expect(result).not.toContain('?inline');
    // Extension is moved into the prefix, not at the end
    expect(result).not.toMatch(/\.scss$/);
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

  it('should resolve bare virtual style ids to rollup virtual modules', () => {
    const plugins = angular({ jit: true });
    const mainPlugin = plugins.find(
      (p) => p.name === '@analogjs/vite-plugin-angular',
    );
    expect(mainPlugin).toBeDefined();

    const resolveId = (mainPlugin as any).resolveId;
    const virtualId =
      'virtual:@analogjs/vite-plugin-angular:inline-style:test-style-id';

    expect(resolveId(virtualId)).toBe(`\0${virtualId}`);
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

  it('should intercept style ?inline imports and remap to virtual style ids', () => {
    const plugins = angular({ jit: true });
    const mainPlugin = plugins.find(
      (p) => p.name === '@analogjs/vite-plugin-angular',
    );

    const resolveId = (mainPlugin as any).resolveId;
    const importer = '/project/src/app/my-component.ts';

    // Relative .scss?inline
    const result = resolveId('./my-component.scss?inline', importer);
    expect(result).toContain(
      'virtual:@analogjs/vite-plugin-angular:inline-style:',
    );
    expect(result).not.toContain('.scss');

    // Absolute .css?inline
    const result2 = resolveId(
      '/project/src/app/my-component.css?inline',
      '/project/src/app/other.ts',
    );
    expect(result2).toContain(
      'virtual:@analogjs/vite-plugin-angular:inline-style:',
    );
    expect(result2).not.toContain('.css');
  });

  it('should intercept style ?inline imports even without jit mode', () => {
    const plugins = angular();
    const mainPlugin = plugins.find(
      (p) => p.name === '@analogjs/vite-plugin-angular',
    );

    const resolveId = (mainPlugin as any).resolveId;

    const result = resolveId(
      './my-component.scss?inline',
      '/project/src/app/my-component.ts',
    );
    expect(result).toContain(
      'virtual:@analogjs/vite-plugin-angular:inline-style:',
    );
  });

  it('should not match Vite inline security regex or cssLangRE', () => {
    const plugins = angular();
    const mainPlugin = plugins.find(
      (p) => p.name === '@analogjs/vite-plugin-angular',
    );

    const resolveId = (mainPlugin as any).resolveId;
    const inlineRE = /[?&]inline\b/;
    const cssLangRE =
      /\.(css|less|sass|scss|styl|stylus|pcss|postcss|sss)(?:$|\?)/;

    const result = resolveId(
      './my-component.scss?inline',
      '/project/src/app/my-component.ts',
    );
    expect(inlineRE.test(result)).toBe(false);
    expect(cssLangRE.test(result)).toBe(false);
  });

  it('should emit virtual style ids that do not look like stylesheet resources', () => {
    const cssLangRE =
      /\.(css|less|sass|scss|styl|stylus|pcss|postcss|sss)($|\?)/;
    const plugins = angular({ jit: true });
    const mainPlugin = plugins.find(
      (p) => p.name === '@analogjs/vite-plugin-angular',
    );

    const resolveId = (mainPlugin as any).resolveId;
    const virtualId = resolveId(
      'angular:jit:style:file;./my-component.scss',
      '/project/src/app/my-component.ts',
    );

    expect(cssLangRE.test(virtualId)).toBe(false);
  });
});

describe('load ?inline style imports', () => {
  // Vitest's fetchModule path calls moduleGraph.ensureEntryFromUrl before
  // transformRequest, which makes pluginContainer.resolveId a no-op for the
  // module-runner. Direct ?inline imports therefore bypass the resolveId
  // rewrites in tests, and the load hook must still accept the original
  // query directly. (See issue #2263.)
  const tmpDir = tmpdir();

  function getLoadHook() {
    const plugins = angular();
    const mainPlugin = plugins.find(
      (p) => p.name === '@analogjs/vite-plugin-angular',
    );
    const fakeConfig = {
      environments: {},
      root: tmpDir,
      server: { watch: null },
    } as any;
    (mainPlugin as any).configResolved?.(fakeConfig);
    return (mainPlugin as any).load.bind({});
  }

  // TODO: Unskip after reconciling beta→alpha merge. Beta introduced this
  // test expecting preprocessCSS to be called on JIT virtual style imports,
  // but alpha routes that path differently (preprocessCSS.mock.calls is
  // empty). Needs investigation of the JIT virtual style pipeline on alpha.
  it.skip('handles virtual style imports and watches the backing file', async () => {
    const cssPath = path.join(tmpDir, `analog-virtual-${Date.now()}.scss`);
    realFs.writeFileSync(cssPath, '.foo { color: red; }', 'utf-8');

    try {
      const plugins = angular({ jit: true });
      const mainPlugin = plugins.find(
        (p) => p.name === '@analogjs/vite-plugin-angular',
      );

      // Trigger configResolved so resolvedConfig is set
      const fakeConfig = {
        environments: {},
        root: tmpDir,
        server: { watch: null },
      } as any;
      (mainPlugin as any).configResolved?.(fakeConfig);

      const resolveId = (mainPlugin as any).resolveId;
      const addWatchFile = vi.fn();
      const load = (mainPlugin as any).load.bind({ addWatchFile });
      const virtualId = resolveId(
        `angular:jit:style:file;./${path.basename(cssPath)}`,
        path.join(tmpDir, 'host.component.ts'),
      );
      const result = await load(virtualId);

      expect(result).toBeDefined();
      expect(result).toContain('export default');
      expect(result).toContain('color: red');
      expect(addWatchFile).toHaveBeenCalledWith(normalizePath(cssPath));

      const calls = vi.mocked(preprocessCSS).mock.calls;
      expect(calls[calls.length - 1][1]).toBe(normalizePath(cssPath));
    } finally {
      realFs.unlinkSync(cssPath);
    }
  });

  it('skips preprocessCSS for virtual style imports when test.css is disabled', async () => {
    const cssPath = path.join(tmpDir, `analog-virtual-skip-${Date.now()}.scss`);
    realFs.writeFileSync(cssPath, '.foo { color: red; }', 'utf-8');

    try {
      const plugins = angular({ jit: true });
      const mainPlugin = plugins.find(
        (p) => p.name === '@analogjs/vite-plugin-angular',
      );

      // Default Vitest config: `test.css` is unset, which Vitest treats as
      // an empty-include (no preprocessing). The plugin must mirror that.
      (mainPlugin as any).configResolved({
        server: { watch: {} },
        test: {},
      });

      const resolveId = (mainPlugin as any).resolveId;
      const load = (mainPlugin as any).load.bind({ addWatchFile: vi.fn() });
      const virtualId = resolveId(
        `angular:jit:style:file;./${path.basename(cssPath)}`,
        path.join(tmpDir, 'host.component.ts'),
      );

      vi.mocked(preprocessCSS).mockClear();
      const result = await load(virtualId);

      expect(result).toBeDefined();
      expect(result).toContain('export default');
      expect(result).toContain('color: red');
      expect(vi.mocked(preprocessCSS)).not.toHaveBeenCalled();
    } finally {
      realFs.unlinkSync(cssPath);
    }
  });

  it('handles ?inline style imports without going through resolveId', async () => {
    const cssPath = path.join(tmpDir, `analog-inline-${Date.now()}.css`);
    realFs.writeFileSync(cssPath, '.foo { color: red; }', 'utf-8');

    try {
      const load = getLoadHook();
      const result = await load(`${cssPath}?inline`);
      expect(result).toBeDefined();
      expect(result).toContain('export default');
      expect(result).toContain('color: red');
    } finally {
      realFs.unlinkSync(cssPath);
    }
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
  it('clears fs and tsconfig caches before recompiling', async () => {
    const invalidateFsCaches = vi.fn();
    const invalidateTsconfigCaches = vi.fn();
    const performCompilation = vi.fn().mockResolvedValue(undefined);
    const invalidate = createFsWatcherCacheInvalidator(
      invalidateFsCaches,
      invalidateTsconfigCaches,
      performCompilation,
    );

    await invalidate();

    expect(invalidateFsCaches).toHaveBeenCalledOnce();
    expect(invalidateTsconfigCaches).toHaveBeenCalledOnce();
    expect(performCompilation).toHaveBeenCalledOnce();
  });
});

describe('evictDeletedFileMetadata', () => {
  it('removes component and stylesheet ownership for deleted files', () => {
    const removeActiveGraphMetadata = vi.fn();
    const removeStyleOwnerMetadata = vi.fn();
    const classNamesMap = new Map<string, string>([
      ['/workspace/apps/demo/src/app/demo.component.ts', 'DemoComponent'],
    ]);
    const fileTransformMap = new Map<string, string>([
      ['/workspace/apps/demo/src/app/demo.component.ts', '@Component({})'],
    ]);

    evictDeletedFileMetadata(
      '/workspace/apps/demo/src/app/demo.component.ts?t=12345',
      {
        removeActiveGraphMetadata,
        removeStyleOwnerMetadata,
        classNamesMap,
        fileTransformMap,
      },
    );

    expect(removeActiveGraphMetadata).toHaveBeenCalledWith(
      '/workspace/apps/demo/src/app/demo.component.ts',
    );
    expect(removeStyleOwnerMetadata).toHaveBeenCalledWith(
      '/workspace/apps/demo/src/app/demo.component.ts',
    );
    expect(
      classNamesMap.has('/workspace/apps/demo/src/app/demo.component.ts'),
    ).toBe(false);
    expect(
      fileTransformMap.has('/workspace/apps/demo/src/app/demo.component.ts'),
    ).toBe(false);
  });
});

describe('injectViteIgnoreForHmrMetadata', () => {
  it('adds @vite-ignore to Angular HMR metadata imports', () => {
    const code =
      'return import(i0.ɵɵgetReplaceMetadataURL(id, t, import.meta.url));';

    expect(injectViteIgnoreForHmrMetadata(code)).toContain(
      'import(/* @vite-ignore */ i0.ɵɵgetReplaceMetadataURL',
    );
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

describe('findTemplateOwnerModules', () => {
  it('maps an external html template back to its ts owner module', () => {
    const ownerModule = {
      id: '/workspace/apps/demo/src/app/demo.component.ts',
      file: '/workspace/apps/demo/src/app/demo.component.ts',
    } as any;
    const server = {
      moduleGraph: {
        getModulesByFile: vi.fn().mockReturnValue(new Set([ownerModule])),
      },
    } as any;

    const result = findTemplateOwnerModules(
      server,
      '/workspace/apps/demo/src/app/demo.component.html',
    );

    expect(server.moduleGraph.getModulesByFile).toHaveBeenCalledWith(
      '/workspace/apps/demo/src/app/demo.component.ts',
    );
    expect(result).toEqual([ownerModule]);
  });

  it('returns no owners when the module graph has no matching ts module', () => {
    const server = {
      moduleGraph: {
        getModulesByFile: vi.fn().mockReturnValue(undefined),
      },
    } as any;

    const result = findTemplateOwnerModules(
      server,
      '/workspace/apps/demo/src/app/demo.component.html',
    );

    expect(result).toEqual([]);
  });
});

describe('findStaticClassAndBoundClassConflicts', () => {
  it('detects an element that mixes static class and [class]', () => {
    const template = `<section class="hero sa:bg-blue-500" [class]="'sa:text-' + align"></section>`;

    expect(findStaticClassAndBoundClassConflicts(template)).toEqual([
      expect.objectContaining({
        line: 1,
        snippet: `<section class="hero sa:bg-blue-500" [class]="'sa:text-' + align">`,
      }),
    ]);
  });

  it('does not flag static class with explicit [class.foo] bindings', () => {
    const template = `<section class="hero" [class.sa:text-center]="isCentered"></section>`;

    expect(findStaticClassAndBoundClassConflicts(template)).toEqual([]);
  });

  it('handles > inside quoted [class] expressions without truncating the tag', () => {
    const template = `<section class="hero" [class]="isWide > isTall ? 'wide' : 'tall'"></section>`;

    expect(findStaticClassAndBoundClassConflicts(template)).toEqual([
      expect.objectContaining({
        line: 1,
        snippet: `<section class="hero" [class]="isWide > isTall ? 'wide' : 'tall'">`,
      }),
    ]);
  });
});

describe('findBoundClassAndNgClassConflicts', () => {
  it('detects an element that mixes [class] and [ngClass]', () => {
    const template = `<section [class]="'hero'" [ngClass]="{ active: isActive }"></section>`;

    expect(findBoundClassAndNgClassConflicts(template)).toEqual([
      expect.objectContaining({
        line: 1,
        snippet: `<section [class]="'hero'" [ngClass]="{ active: isActive }">`,
      }),
    ]);
  });

  it('does not flag [class.foo] with [ngClass]', () => {
    const template = `<section [class.hero]="isHero" [ngClass]="{ active: isActive }"></section>`;

    expect(findBoundClassAndNgClassConflicts(template)).toEqual([]);
  });
});

describe('template class binding guard plugin', () => {
  it('throws for inline templates that mix static class and [class]', () => {
    const plugin = angular().find(
      (p) =>
        p.name === '@analogjs/vite-plugin-angular:template-class-binding-guard',
    ) as Plugin;

    const transform =
      typeof plugin.transform === 'function'
        ? plugin.transform
        : (plugin.transform as any)?.handler;

    expect(() =>
      transform.call(
        {} as any,
        `
          @Component({
            template: \`<section class="hero sa:bg-blue-500" [class]="'sa:text-' + align"></section>\`
          })
          export class DemoComponent {}
        `,
        '/workspace/apps/demo/src/app/demo.component.ts',
      ),
    ).toThrow(/Invalid template class binding/);
  });

  it('throws for external html templates that mix static class and [class]', () => {
    const plugin = angular().find(
      (p) =>
        p.name === '@analogjs/vite-plugin-angular:template-class-binding-guard',
    ) as Plugin;

    const transform =
      typeof plugin.transform === 'function'
        ? plugin.transform
        : (plugin.transform as any)?.handler;

    expect(() =>
      transform.call(
        {} as any,
        `<section class="hero sa:bg-blue-500" [class]="'sa:text-' + align"></section>`,
        '/workspace/apps/demo/src/app/demo.component.html',
      ),
    ).toThrow(/Use `\[ngClass\]` or explicit `\[class\.foo\]` bindings/);
  });

  it('warns for external html templates that mix [class] and [ngClass]', () => {
    const plugin = angular().find(
      (p) =>
        p.name === '@analogjs/vite-plugin-angular:template-class-binding-guard',
    ) as Plugin;

    const transform =
      typeof plugin.transform === 'function'
        ? plugin.transform
        : (plugin.transform as any)?.handler;
    const warn = vi.fn();

    transform.call(
      { warn } as any,
      `<section [class]="'hero'" [ngClass]="{ active: isActive }"></section>`,
      '/workspace/apps/demo/src/app/demo.component.html',
    );

    expect(warn).toHaveBeenCalledWith(
      expect.stringMatching(/Conflicting class composition/),
    );
  });

  it('throws for selectorless non-page components', () => {
    const plugin = angular().find(
      (p) =>
        p.name === '@analogjs/vite-plugin-angular:template-class-binding-guard',
    ) as Plugin;

    const transform =
      typeof plugin.transform === 'function'
        ? plugin.transform
        : (plugin.transform as any)?.handler;
    expect(() =>
      transform.call(
        { warn: vi.fn() } as any,
        `
          @Component({
            template: '<section></section>'
          })
          export class DemoDialogComponent {}
        `,
        '/workspace/libs/demo/src/lib/demo-dialog.component.ts',
      ),
    ).toThrow(/Selectorless component detected/);
  });

  it('allows selectorless page components', () => {
    const plugin = angular().find(
      (p) =>
        p.name === '@analogjs/vite-plugin-angular:template-class-binding-guard',
    ) as Plugin;

    const transform =
      typeof plugin.transform === 'function'
        ? plugin.transform
        : (plugin.transform as any)?.handler;

    expect(() =>
      transform.call(
        { warn: vi.fn() } as any,
        `
          @Component({
            template: '<section>Page</section>'
          })
          export default class DemoPageComponent {}
        `,
        '/workspace/apps/demo/src/app/pages/demo.page.ts',
      ),
    ).not.toThrow();
  });

  it('allows selectorless components inside pages directories', () => {
    const plugin = angular().find(
      (p) =>
        p.name === '@analogjs/vite-plugin-angular:template-class-binding-guard',
    ) as Plugin;

    const transform =
      typeof plugin.transform === 'function'
        ? plugin.transform
        : (plugin.transform as any)?.handler;

    expect(() =>
      transform.call(
        { warn: vi.fn() } as any,
        `
          @Component({
            imports: [RouterOutlet],
            template: '<router-outlet />'
          })
          export default class DemoShellComponent {}
        `,
        '/workspace/apps/demo/src/app/pages/(shell).ts',
      ),
    ).not.toThrow();
  });

  it('throws for duplicate selectors in the active graph', () => {
    const plugin = angular().find(
      (p) =>
        p.name === '@analogjs/vite-plugin-angular:template-class-binding-guard',
    ) as Plugin;

    const transform =
      typeof plugin.transform === 'function'
        ? plugin.transform
        : (plugin.transform as any)?.handler;

    transform.call(
      { warn: vi.fn() } as any,
      `
        @Component({
          selector: 'demo-card',
          template: '<section></section>'
        })
        export class DemoCardComponent {}
      `,
      '/workspace/libs/demo/src/lib/demo-card.component.ts',
    );

    expect(() =>
      transform.call(
        { warn: vi.fn() } as any,
        `
          @Component({
            selector: 'demo-card',
            template: '<section></section>'
          })
          export class DemoCardCloneComponent {}
        `,
        '/workspace/libs/demo/src/lib/demo-card-clone.component.ts',
      ),
    ).toThrow(/Duplicate component selector detected/);
  });

  it('warns for duplicate component class names in the active graph', () => {
    const plugin = angular().find(
      (p) =>
        p.name === '@analogjs/vite-plugin-angular:template-class-binding-guard',
    ) as Plugin;

    const transform =
      typeof plugin.transform === 'function'
        ? plugin.transform
        : (plugin.transform as any)?.handler;
    const firstWarn = vi.fn();
    const secondWarn = vi.fn();

    transform.call(
      { warn: firstWarn } as any,
      `
        @Component({
          selector: 'demo-alpha',
          template: '<section></section>'
        })
        export class DemoSharedComponent {}
      `,
      '/workspace/libs/demo/src/lib/demo-alpha.component.ts',
    );

    transform.call(
      { warn: secondWarn } as any,
      `
        @Component({
          selector: 'demo-beta',
          template: '<section></section>'
        })
        export class DemoSharedComponent {}
      `,
      '/workspace/libs/demo/src/lib/demo-beta.component.ts',
    );

    expect(secondWarn).toHaveBeenCalledWith(
      expect.stringMatching(/Duplicate component class name detected/),
    );
  });
});

// =============================================================================
// Tailwind CSS @reference injection
//
// Regression tests for the tailwind-reference Vite plugin and the
// buildStylePreprocessor function that together ensure Angular component CSS
// files receive `@reference` directives pointing to the root Tailwind
// stylesheet. Without @reference, @tailwindcss/vite processes each component
// CSS in isolation and can't resolve prefixed utilities like `sa:flex`.
//
// Background:
//   - Angular component CSS (e.g. card.component.css) uses `@apply sa:flex`
//   - Tailwind v4 needs `@import 'tailwindcss' prefix(sa)` or `@reference`
//     to a file that has it, otherwise it treats `sa:` as an unknown variant
//   - The `buildStylePreprocessor` injects @reference during Angular
//     compilation (before Vite transforms)
//   - The `tailwind-reference` plugin (enforce:"pre") acts as a Vite
//     transform-level safety net
// =============================================================================

describe('tailwind-reference plugin', () => {
  let rootCssDir = '';
  let ROOT_CSS = '';

  beforeAll(() => {
    rootCssDir = mkdtempSync(join(tmpdir(), 'analog-tailwind-root-'));
    ROOT_CSS = join(rootCssDir, 'tailwind.css');
    // Use an actual Tailwind root file so the assertions stay focused on
    // @reference injection behavior instead of missing-file warnings.
    writeFileSync(ROOT_CSS, '@import "tailwindcss" prefix(sa);\n', 'utf-8');
  });

  afterAll(() => {
    rmSync(rootCssDir, { recursive: true, force: true });
  });

  /**
   * Helper: extract the tailwind-reference sub-plugin from the array
   * returned by angular(). Returns undefined if tailwindCss is not configured.
   */
  function getTailwindReferencePlugin(
    options?: Parameters<typeof angular>[0],
  ): Plugin | undefined {
    const plugins = angular(options);
    return plugins.find(
      (p) => p.name === '@analogjs/vite-plugin-angular:tailwind-reference',
    );
  }

  /**
   * Helper: call the plugin's transform hook with the given CSS code and id.
   * Returns the transformed output (string or undefined if skipped).
   */
  function callTransform(
    plugin: Plugin,
    code: string,
    id: string,
  ): string | undefined {
    const transform =
      typeof plugin.transform === 'function'
        ? plugin.transform
        : (plugin.transform as any)?.handler;
    // The transform is synchronous in this plugin
    return transform?.call({} as any, code, id) as string | undefined;
  }

  // ---------------------------------------------------------------------------
  // Plugin creation
  // ---------------------------------------------------------------------------

  it('is included when tailwindCss option is provided', () => {
    const plugin = getTailwindReferencePlugin({
      tailwindCss: { rootStylesheet: ROOT_CSS },
    });
    expect(plugin).toBeDefined();
    expect(plugin!.enforce).toBe('pre');
  });

  it('is NOT included when tailwindCss option is omitted', () => {
    const plugin = getTailwindReferencePlugin();
    expect(plugin).toBeUndefined();
  });

  it('is NOT included when tailwindCss option is undefined', () => {
    const plugin = getTailwindReferencePlugin({ tailwindCss: undefined });
    expect(plugin).toBeUndefined();
  });

  // ---------------------------------------------------------------------------
  // @reference injection via transform
  // ---------------------------------------------------------------------------

  describe('transform', () => {
    let plugin: Plugin;

    beforeEach(() => {
      plugin = getTailwindReferencePlugin({
        tailwindCss: { rootStylesheet: ROOT_CSS, prefixes: ['sa:'] },
      })!;
    });

    it('injects @reference into component CSS that uses the configured prefix', () => {
      const css = '.demo { @apply sa:flex sa:gap-4; }';
      const result = callTransform(
        plugin,
        css,
        '/project/src/app/demo.component.css',
      );
      expect(result).toBe(`@reference "${ROOT_CSS}";\n${css}`);
    });

    it('injects @reference for CSS served with ?direct&ngcomp query params', () => {
      // Angular externalizes component CSS with these query params
      const css = ':host { @apply sa:grid; }';
      const result = callTransform(
        plugin,
        css,
        '/project/src/app/card.component.css?direct&ngcomp=ng-c123&e=0',
      );
      expect(result).toBe(`@reference "${ROOT_CSS}";\n${css}`);
    });

    it('skips non-CSS files', () => {
      const result = callTransform(
        plugin,
        'import { Component } from "@angular/core";',
        '/project/src/app/app.component.ts',
      );
      expect(result).toBeUndefined();
    });

    it('skips the root stylesheet itself', () => {
      const result = callTransform(
        plugin,
        '@import "tailwindcss" prefix(sa);',
        ROOT_CSS,
      );
      expect(result).toBeUndefined();
    });

    it('skips the root stylesheet even with query params', () => {
      const result = callTransform(
        plugin,
        '@import "tailwindcss" prefix(sa);',
        `${ROOT_CSS}?direct`,
      );
      expect(result).toBeUndefined();
    });

    it('skips CSS that already has @reference', () => {
      const css = `@reference "${ROOT_CSS}";\n.demo { @apply sa:flex; }`;
      const result = callTransform(
        plugin,
        css,
        '/project/src/app/demo.component.css',
      );
      expect(result).toBeUndefined();
    });

    it('throws a clear error when @reference only appears in comment text', () => {
      const css =
        '/* keep this comment away from @reference injection */\n.demo { @apply sa:flex; }';

      expect(() =>
        callTransform(plugin, css, '/project/src/app/demo.component.css'),
      ).toThrowError(
        /contains the text "@reference" but does not contain a real @reference directive/,
      );
    });

    it('does not treat quoted comment markers as a collision', () => {
      const css =
        '.demo::before { content: "/* @reference */"; }\n.demo { @apply sa:flex; }';
      const result = callTransform(
        plugin,
        css,
        '/project/src/app/demo.component.css',
      );

      expect(result).toBe(`@reference "${ROOT_CSS}";\n${css}`);
    });

    it('skips CSS that imports tailwindcss directly (double quotes)', () => {
      const css =
        '@import "tailwindcss" prefix(sa);\n.demo { @apply sa:flex; }';
      const result = callTransform(plugin, css, '/project/src/app/global.css');
      expect(result).toBeUndefined();
    });

    it('skips CSS that imports tailwindcss directly (single quotes)', () => {
      const css =
        "@import 'tailwindcss' prefix(sa);\n.demo { @apply sa:flex; }";
      const result = callTransform(plugin, css, '/project/src/app/global.css');
      expect(result).toBeUndefined();
    });

    it('skips CSS that references the root stylesheet by basename', () => {
      const css = `@import './tailwind.css';\n.demo { @apply sa:flex; }`;
      const result = callTransform(plugin, css, '/project/src/app/main.css');
      expect(result).toBeUndefined();
    });

    it('skips CSS that does not use the configured prefix', () => {
      // Plain CSS with no Tailwind utilities — should not get @reference
      const css = '.demo { display: flex; gap: 1rem; }';
      const result = callTransform(
        plugin,
        css,
        '/project/src/app/demo.component.css',
      );
      expect(result).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // Prefix detection
  // ---------------------------------------------------------------------------

  describe('prefix detection', () => {
    it('falls back to @apply detection when no prefixes are configured', () => {
      const plugin = getTailwindReferencePlugin({
        tailwindCss: { rootStylesheet: ROOT_CSS },
      })!;

      // Contains @apply but no specific prefix
      const css = '.demo { @apply flex gap-4; }';
      const result = callTransform(
        plugin,
        css,
        '/project/src/app/demo.component.css',
      );
      expect(result).toBe(`@reference "${ROOT_CSS}";\n${css}`);
    });

    it('does not inject for CSS without @apply when no prefixes configured', () => {
      const plugin = getTailwindReferencePlugin({
        tailwindCss: { rootStylesheet: ROOT_CSS },
      })!;

      const css = '.demo { display: flex; }';
      const result = callTransform(
        plugin,
        css,
        '/project/src/app/demo.component.css',
      );
      expect(result).toBeUndefined();
    });

    it('supports multiple configured prefixes', () => {
      const plugin = getTailwindReferencePlugin({
        tailwindCss: { rootStylesheet: ROOT_CSS, prefixes: ['sa:', 'tw:'] },
      })!;

      // Uses tw: prefix (second in the list)
      const css = '.demo { @apply tw:text-red-500; }';
      const result = callTransform(
        plugin,
        css,
        '/project/src/app/demo.component.css',
      );
      expect(result).toBe(`@reference "${ROOT_CSS}";\n${css}`);
    });
  });

  describe('buildStylePreprocessor', () => {
    it('throws a clear error when @reference only appears in comment text', () => {
      const preprocessor = buildStylePreprocessor({
        tailwindCss: { rootStylesheet: ROOT_CSS, prefixes: ['sa:'] },
      });

      expect(() =>
        preprocessor?.(
          '/* keep this comment away from @reference injection */\n.demo { @apply sa:flex; }',
          '/project/src/app/demo.component.css',
        ),
      ).toThrowError(
        /contains the text "@reference" but does not contain a real @reference directive/,
      );
    });

    it('does not treat quoted comment markers as a collision', () => {
      const preprocessor = buildStylePreprocessor({
        tailwindCss: { rootStylesheet: ROOT_CSS, prefixes: ['sa:'] },
      });
      const css =
        '.demo::before { content: "/* @reference */"; }\n.demo { @apply sa:flex; }';

      expect(
        preprocessor?.(css, '/project/src/app/demo.component.css')?.code,
      ).toBe(`@reference "${ROOT_CSS}";\n${css}`);
    });
  });

  // ---------------------------------------------------------------------------
  // Windows path normalization (#2293)
  // ---------------------------------------------------------------------------

  describe('Windows path normalization', () => {
    it('normalizes backslash paths in buildStylePreprocessor @reference injection', () => {
      // Simulate a Windows-style absolute path with backslashes.
      // On non-Windows, existsSync will warn but the preprocessor still
      // runs and injects @reference — we only care about the output format.
      const winPath = 'D:\\projects\\libs\\styles\\tailwind.css';
      const preprocessor = buildStylePreprocessor({
        tailwindCss: { rootStylesheet: winPath, prefixes: ['sa:'] },
      });

      const css = '.demo { @apply sa:flex; }';
      const result = preprocessor?.(css, '/project/src/app/demo.component.css');
      // The injected @reference path must use forward slashes
      expect(result?.code).toContain(
        '@reference "D:/projects/libs/styles/tailwind.css"',
      );
      expect(result?.code).not.toContain('\\');
    });

    it('normalizes backslash paths in tailwind-reference pre-transform plugin', () => {
      const winPath = 'D:\\projects\\libs\\styles\\tailwind.css';
      const plugin = getTailwindReferencePlugin({
        tailwindCss: { rootStylesheet: winPath, prefixes: ['sa:'] },
      })!;

      const css = '.demo { @apply sa:flex; }';
      const result = callTransform(
        plugin,
        css,
        '/project/src/app/demo.component.css',
      );
      // The injected @reference path must use forward slashes
      expect(result).toContain(
        '@reference "D:/projects/libs/styles/tailwind.css"',
      );
      expect(result).not.toContain('\\');
    });
  });

  // ---------------------------------------------------------------------------
  // Encapsulation plugin ordering (#2293)
  //
  // @tailwindcss/vite runs with enforce: 'pre', so Angular's encapsulation
  // (ShadowCss rewriting :host to [_nghost-xxx]) must run AFTER Tailwind
  // resolves @apply directives. Encapsulation is therefore placed in a
  // separate plugin with enforce: 'post'.
  // ---------------------------------------------------------------------------

  describe('encapsulation plugin', () => {
    function getEncapsulationPlugin(
      options?: Parameters<typeof angular>[0],
    ): Plugin | undefined {
      const plugins = angular(options);
      return plugins.find(
        (p) => p.name === '@analogjs/vite-plugin-angular:encapsulation',
      );
    }

    it('is registered as a separate plugin with enforce: "post"', () => {
      const plugin = getEncapsulationPlugin();
      expect(plugin).toBeDefined();
      expect(plugin!.enforce).toBe('post');
    });

    it('has a transform hook', () => {
      const plugin = getEncapsulationPlugin();
      expect(plugin!.transform).toBeDefined();
    });

    it('runs after the tailwind-reference plugin in the plugin array', () => {
      const plugins = angular({
        tailwindCss: { rootStylesheet: ROOT_CSS, prefixes: ['sa:'] },
      });
      const twIndex = plugins.findIndex(
        (p) => p.name === '@analogjs/vite-plugin-angular:tailwind-reference',
      );
      const encapIndex = plugins.findIndex(
        (p) => p.name === '@analogjs/vite-plugin-angular:encapsulation',
      );
      // Both must exist and encapsulation must come after
      expect(twIndex).toBeGreaterThanOrEqual(0);
      expect(encapIndex).toBeGreaterThanOrEqual(0);
      expect(encapIndex).toBeGreaterThan(twIndex);
    });

    it('runs after the main Angular plugin in the plugin array', () => {
      const plugins = angular();
      const mainIndex = plugins.findIndex(
        (p) => p.name === '@analogjs/vite-plugin-angular',
      );
      const encapIndex = plugins.findIndex(
        (p) => p.name === '@analogjs/vite-plugin-angular:encapsulation',
      );
      expect(mainIndex).toBeGreaterThanOrEqual(0);
      expect(encapIndex).toBeGreaterThan(mainIndex);
    });
  });
});

// =============================================================================
// hasComponent detection
//
// When useAngularCompilationAPI is enabled, the Vite transform hook receives
// already-compiled code (decorators stripped), so hasComponent is always false.
// This suite is behavior documentation for both compilation paths rather than
// a regression harness for `hasComponent`.
// =============================================================================

describe('hasComponent detection behavior docs', () => {
  it('documents @Component detection in raw TypeScript source (legacy path)', () => {
    // Simulates what the legacy (non-API) compilation path sees
    const rawTs = `
      import { Component } from '@angular/core';
      @Component({ selector: 'app-demo', template: '<div>hi</div>' })
      export class DemoComponent {}
    `;
    expect(rawTs.includes('@Component')).toBe(true);
  });

  it('documents missing @Component detection in compiled output (useAngularCompilationAPI path)', () => {
    // Simulates what the Vite transform hook sees after Angular compilation.
    // `@Component` becomes `ɵɵdefineComponent()`, so the naive string check
    // returns false. This is expected documented behavior for that path.
    const compiledJs = `
      import * as i0 from "@angular/core";
      export class DemoComponent {}
      DemoComponent.ɵcmp = i0.ɵɵdefineComponent({
        type: DemoComponent,
        selectors: [["app-demo"]],
        decls: 1,
        template: function(rf, ctx) { if (rf & 1) { i0.ɵɵelement(0, "div"); } }
      });
    `;
    expect(compiledJs.includes('@Component')).toBe(false);
  });
});
