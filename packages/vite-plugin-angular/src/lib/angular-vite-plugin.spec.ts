import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
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
  createFsWatcherCacheInvalidator,
  evictDeletedFileMetadata,
  findTemplateOwnerModules,
  findComponentStylesheetWrapperModules,
  getModulesForChangedFile,
  isModuleForChangedResource,
  isIgnoredHmrFile,
  injectViteIgnoreForHmrMetadata,
  mapTemplateUpdatesToFiles,
  refreshStylesheetRegistryForFile,
  toAngularCompilationFileReplacements,
  isTestWatchMode,
} from './angular-vite-plugin';
import { normalizeIncludeGlob } from './utils/tsconfig-resolver';
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
      (p) => p.name === '@analogjs/vite-plugin-angular:virtual-modules',
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
      (p) => p.name === '@analogjs/vite-plugin-angular:virtual-modules',
    );
    expect(mainPlugin).toBeDefined();

    const resolveId = (mainPlugin as any).resolveId;
    const virtualId = 'virtual:@analogjs/vite-plugin-angular:raw:test-raw-id';

    expect(resolveId(virtualId)).toBe(`\0${virtualId}`);
  });

  it('should intercept .html?raw imports and remap to virtual raw ids', () => {
    const plugins = angular({ jit: true });
    const mainPlugin = plugins.find(
      (p) => p.name === '@analogjs/vite-plugin-angular:virtual-modules',
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
      (p) => p.name === '@analogjs/vite-plugin-angular:virtual-modules',
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
      (p) => p.name === '@analogjs/vite-plugin-angular:virtual-modules',
    );

    const resolveId = (mainPlugin as any).resolveId;
    const virtualId = resolveId(
      'angular:jit:template:file;./my-component.svg',
      '/project/src/app/my-component.ts',
    );

    expect(assetRE.test(virtualId)).toBe(false);
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

  function getVirtualModulesPlugin() {
    const plugins = angular({ jit: true });
    return plugins.find(
      (p) => p.name === '@analogjs/vite-plugin-angular:virtual-modules',
    );
  }

  function loadHook() {
    const mainPlugin = getMainPlugin();
    (mainPlugin as any).configResolved({
      server: { watch: {} },
      safeModulePaths: new Set(),
    });
    return (mainPlugin as any).load.bind({ addWatchFile: vi.fn() });
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
      const vmPlugin = getVirtualModulesPlugin();
      const resolveId = (vmPlugin as any).resolveId;
      const virtualId = resolveId(
        `angular:jit:template:file;./${path.basename(svgPath)}`,
        path.join(tmpDir, 'host.component.ts'),
      );

      expect(virtualId).toContain('virtual:@analogjs/vite-plugin-angular:raw:');
      expect(virtualId).not.toContain('.svg');

      const mainPlugin = getMainPlugin();
      (mainPlugin as any).configResolved({
        server: { watch: {} },
        safeModulePaths: new Set(),
      });
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
      const vmPlugin = getVirtualModulesPlugin();
      const resolveId = (vmPlugin as any).resolveId;
      const virtualId = resolveId(
        `angular:jit:template:file;./${path.basename(htmlPath)}`,
        path.join(tmpDir, 'host.component.ts'),
      );
      const mainPlugin = getMainPlugin();
      (mainPlugin as any).configResolved({
        server: { watch: {} },
        safeModulePaths: new Set(),
      });
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
  it('removes class name and transform entries for deleted files', () => {
    const classNamesMap = new Map<string, string>([
      ['/workspace/apps/demo/src/app/demo.component.ts', 'DemoComponent'],
    ]);
    const fileTransformMap = new Map<string, string>([
      ['/workspace/apps/demo/src/app/demo.component.ts', '@Component({})'],
    ]);

    evictDeletedFileMetadata(
      '/workspace/apps/demo/src/app/demo.component.ts?t=12345',
      {
        classNamesMap,
        fileTransformMap,
      },
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

// =============================================================================
// Encapsulation plugin ordering (#2293)
//
// @tailwindcss/vite runs with enforce: 'pre', so Angular's encapsulation
// (ShadowCss rewriting :host to [_nghost-xxx]) must run AFTER Tailwind
// resolves @apply directives. Encapsulation is therefore placed in a
// separate plugin with enforce: 'post'.
// =============================================================================

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
  template: '<h1>hello</h1>',
})
export class AppComponent {}
`,
      'utf-8',
    );
  });

  afterEach(() => {
    realFs.rmSync(fixtureDir, { recursive: true, force: true });
  });

  // The plugin reads these at creation time to pick the AOT/JIT path, so an
  // app build has to be simulated by clearing Vitest's own markers.
  function createAppBuildPlugin() {
    const { VITEST, NODE_ENV } = process.env;
    delete process.env['VITEST'];
    delete process.env['NODE_ENV'];

    try {
      return angular({
        tsconfig: path.join(fixtureDir, 'tsconfig.json'),
        workspaceRoot: fixtureDir,
      }).find((p) => p.name === '@analogjs/vite-plugin-angular') as any;
    } finally {
      process.env['VITEST'] = VITEST as string;
      if (NODE_ENV) {
        process.env['NODE_ENV'] = NODE_ENV;
      }
    }
  }

  it('waits for the initial compilation before emitting a transform result', async () => {
    const mainPlugin = createAppBuildPlugin();

    await mainPlugin.config(
      { root: fixtureDir, build: {} },
      { command: 'build' },
    );
    mainPlugin.configResolved({
      root: fixtureDir,
      mode: 'production',
      build: {},
      server: { watch: {} },
      safeModulePaths: new Set(),
    });

    const ctx = { warn: vi.fn(), error: vi.fn(), addWatchFile: vi.fn() };
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
});
