import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const createAngularCompilationMock = vi.fn();
const preprocessCSSMock = vi.fn();
const originalNodeEnv = process.env['NODE_ENV'];
const originalVitestEnv = process.env['VITEST'];

let cachedViteActual: typeof import('vite');
let cachedDevkitActual: typeof import('../utils/devkit.js');

describe('angularCompilationPlugin', () => {
  let tempRoot: string;
  let angularCompilationPlugin: typeof import('../../index.js').angularCompilationPlugin;

  function getCompilerPlugin(
    options: Parameters<typeof angularCompilationPlugin>[0],
  ) {
    return angularCompilationPlugin(options).find(
      (plugin) =>
        plugin.name === '@analogjs/vite-plugin-angular-compilation-api',
    )!;
  }

  async function configure(plugin: ReturnType<typeof getCompilerPlugin>) {
    await (plugin.config as any)(
      { root: tempRoot, mode: 'development' },
      { command: 'serve', mode: 'development' },
    );
    await (plugin.configResolved as any)({
      root: tempRoot,
      cacheDir: join(tempRoot, '.vite'),
      mode: 'development',
      build: {},
      server: { hmr: true },
      plugins: [],
    });
  }

  beforeEach(async () => {
    process.env['NODE_ENV'] = 'development';
    delete process.env['VITEST'];
    vi.resetModules();
    createAngularCompilationMock.mockReset();
    preprocessCSSMock.mockReset();

    tempRoot = mkdtempSync(join(tmpdir(), 'analog-compilation-api-'));
    writeFileSync(
      join(tempRoot, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          module: 'esnext',
          moduleResolution: 'bundler',
          target: 'es2022',
        },
      }),
    );

    cachedViteActual ??= await vi.importActual<typeof import('vite')>('vite');
    cachedDevkitActual ??=
      await vi.importActual<typeof import('../utils/devkit.js')>(
        '../utils/devkit.js',
      );

    vi.doMock('vite', () => ({
      ...cachedViteActual,
      preprocessCSS: preprocessCSSMock,
    }));

    vi.doMock('../utils/devkit.js', () => ({
      ...cachedDevkitActual,
      angularFullVersion: 200100,
      createAngularCompilation: createAngularCompilationMock,
    }));
    ({ angularCompilationPlugin } = await import('../../index.js'));
  });

  afterEach(() => {
    process.env['NODE_ENV'] = originalNodeEnv;
    if (originalVitestEnv !== undefined) {
      process.env['VITEST'] = originalVitestEnv;
    }
    vi.doUnmock('vite');
    vi.doUnmock('../utils/devkit.js');
    vi.restoreAllMocks();
    if (tempRoot) {
      try {
        rmSync(tempRoot, { recursive: true, force: true });
      } catch {
        // cleanup best effort
      }
    }
  });

  it('creates a plugin with the correct name and enforce', async () => {
    const plugin = getCompilerPlugin({
      tsconfig: () => join(tempRoot, 'tsconfig.json'),
      workspaceRoot: tempRoot,
      inlineStylesExtension: 'css',
      jit: false,
      liveReload: true,
      disableTypeChecking: true,
      supportedBrowsers: ['safari 15'],
      fileReplacements: [],
      include: [],
    });

    expect(plugin.name).toBe('@analogjs/vite-plugin-angular-compilation-api');
    expect(plugin.enforce).toBe('pre');
  });

  it('has required Vite plugin hooks', async () => {
    const plugin = getCompilerPlugin({
      tsconfig: () => join(tempRoot, 'tsconfig.json'),
      workspaceRoot: tempRoot,
      inlineStylesExtension: 'css',
      jit: false,
      liveReload: true,
      disableTypeChecking: true,
      supportedBrowsers: ['safari 15'],
      fileReplacements: [],
      include: [],
    });

    expect(plugin.config).toBeTypeOf('function');
    expect(plugin.configResolved).toBeTypeOf('function');
    expect(plugin.configureServer).toBeTypeOf('function');
    expect(plugin.buildStart).toBeTypeOf('function');
    expect(plugin.handleHotUpdate).toBeTypeOf('function');
    expect(plugin.resolveId).toBeTypeOf('function');
    expect(plugin.load).toBeTypeOf('function');
    expect(plugin.transform).toBeDefined();
    expect(plugin.closeBundle).toBeTypeOf('function');
  });

  it('config hook disables esbuild/oxc', async () => {
    const plugin = getCompilerPlugin({
      tsconfig: () => join(tempRoot, 'tsconfig.json'),
      workspaceRoot: tempRoot,
      inlineStylesExtension: 'css',
      jit: false,
      liveReload: true,
      disableTypeChecking: true,
      supportedBrowsers: ['safari 15'],
      fileReplacements: [],
      include: [],
    });

    const result = await (plugin.config as any)(
      { root: tempRoot, mode: 'development' },
      { command: 'serve', mode: 'development' },
    );

    expect(result.esbuild).toBeUndefined();
    expect(result.oxc).toBeUndefined();
  });

  it('initializes compilation on buildStart', async () => {
    const initializeMock = vi.fn().mockResolvedValue({
      externalStylesheets: new Map(),
      templateUpdates: new Map(),
    });
    const diagnoseFilesMock = vi
      .fn()
      .mockResolvedValue({ errors: [], warnings: [] });
    const emitAffectedFilesMock = vi.fn().mockResolvedValue([]);

    createAngularCompilationMock.mockResolvedValue({
      initialize: initializeMock,
      update: vi.fn(),
      diagnoseFiles: diagnoseFilesMock,
      emitAffectedFiles: emitAffectedFilesMock,
    });

    const plugin = getCompilerPlugin({
      tsconfig: () => join(tempRoot, 'tsconfig.json'),
      workspaceRoot: tempRoot,
      inlineStylesExtension: 'css',
      jit: false,
      liveReload: false,
      disableTypeChecking: true,
      supportedBrowsers: ['safari 15'],
      fileReplacements: [],
      include: [],
    });

    await (plugin.config as any)(
      { root: tempRoot, mode: 'development' },
      { command: 'serve', mode: 'development' },
    );
    await (plugin.configResolved as any)({
      cacheDir: join(tempRoot, '.vite'),
      root: tempRoot,
      mode: 'development',
      build: {},
      server: {},
      plugins: [],
    });
    await (plugin.buildStart as any).call({
      addWatchFile: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
    });

    expect(createAngularCompilationMock).toHaveBeenCalledOnce();
    expect(initializeMock).toHaveBeenCalledOnce();
    expect(emitAffectedFilesMock).toHaveBeenCalledOnce();
  });

  it('hands the stylesheet registry to analog.setup configurators', async () => {
    const configure = vi.fn();
    const plugin = getCompilerPlugin({
      tsconfig: () => join(tempRoot, 'tsconfig.json'),
      workspaceRoot: tempRoot,
      inlineStylesExtension: 'css',
      jit: false,
      liveReload: false,
      disableTypeChecking: true,
      supportedBrowsers: ['safari 15'],
      fileReplacements: [],
      include: [],
    });

    await (plugin.configResolved as any)({
      cacheDir: join(tempRoot, '.vite'),
      root: tempRoot,
      mode: 'development',
      build: {},
      server: { hmr: true },
      plugins: [
        {
          name: 'vite-plugin-xyz',
          analog: {
            setup(ctx: any) {
              ctx.configureStylesheetRegistry(configure);
            },
          },
        },
      ],
    });

    expect(configure).toHaveBeenCalledWith(
      expect.objectContaining({
        getRequestIdsForSource: expect.any(Function),
      }),
      { workspaceRoot: tempRoot },
    );
  });

  it('externalizes component styles when a Vite plugin requests it through analog.setup', async () => {
    const containingFile = join(tempRoot, 'src/demo.component.ts');
    const resourceFile = join(tempRoot, 'src/demo.component.css');
    let stylesheetId = '';

    const initializeMock = vi
      .fn()
      .mockImplementation(async (_tsconfig, host) => {
        stylesheetId = await host.transformStylesheet(
          '.demo { @apply sa:flex; }',
          containingFile,
          resourceFile,
          0,
          'DemoComponent',
        );

        return {
          externalStylesheets: new Map(),
          templateUpdates: new Map(),
        };
      });

    createAngularCompilationMock.mockResolvedValue({
      initialize: initializeMock,
      update: vi.fn(),
      diagnoseFiles: vi.fn().mockResolvedValue({ errors: [], warnings: [] }),
      emitAffectedFiles: vi.fn().mockResolvedValue([]),
    });

    const plugin = getCompilerPlugin({
      tsconfig: () => join(tempRoot, 'tsconfig.json'),
      workspaceRoot: tempRoot,
      inlineStylesExtension: 'css',
      jit: false,
      liveReload: false,
      disableTypeChecking: true,
      supportedBrowsers: ['safari 15'],
      fileReplacements: [],
      include: [],
    });

    await (plugin.config as any)(
      { root: tempRoot, mode: 'development' },
      { command: 'serve', mode: 'development' },
    );
    await (plugin.configResolved as any)({
      cacheDir: join(tempRoot, '.vite'),
      root: tempRoot,
      mode: 'development',
      build: {},
      server: { hmr: true },
      plugins: [
        {
          name: 'vite-plugin-xyz',
          analog: {
            setup(ctx: any) {
              ctx.externalizeComponentStyles();
            },
          },
        },
      ],
    });
    await (plugin.buildStart as any).call({
      addWatchFile: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
    });

    expect(stylesheetId).toMatch(/^[a-f0-9]+\.css$/);
    expect(preprocessCSSMock).not.toHaveBeenCalled();
    expect((plugin.resolveId as any)(`/${stylesheetId}?ngcomp=ng-c1&e=0`)).toBe(
      `${resourceFile}?ngcomp=ng-c1&e=0`,
    );
    await expect(
      (plugin.load as any)(`${resourceFile}?ngcomp=ng-c1&e=0`),
    ).resolves.toBe('.demo { @apply sa:flex; }');
  });

  it('maps templateUpdates to HMR metadata', async () => {
    const testFile = join(tempRoot, 'src/app.component.ts');
    const initializeMock = vi.fn().mockResolvedValue({
      externalStylesheets: new Map(),
      templateUpdates: new Map([
        [
          encodeURIComponent(`src/app.component.ts@AppComponent`),
          '/* hmr update code */',
        ],
      ]),
    });
    const emitAffectedFilesMock = vi.fn().mockResolvedValue([
      {
        filename: testFile,
        contents: 'compiled output',
      },
    ]);

    createAngularCompilationMock.mockResolvedValue({
      initialize: initializeMock,
      update: vi.fn(),
      diagnoseFiles: vi.fn().mockResolvedValue({ errors: [], warnings: [] }),
      emitAffectedFiles: emitAffectedFilesMock,
    });

    const plugin = getCompilerPlugin({
      tsconfig: () => join(tempRoot, 'tsconfig.json'),
      workspaceRoot: tempRoot,
      inlineStylesExtension: 'css',
      jit: false,
      liveReload: true,
      disableTypeChecking: true,
      supportedBrowsers: ['safari 15'],
      fileReplacements: [],
      include: [],
    });

    await (plugin.config as any)(
      { root: tempRoot, mode: 'development' },
      { command: 'serve', mode: 'development' },
    );
    await (plugin.configResolved as any)({
      cacheDir: join(tempRoot, '.vite'),
      root: tempRoot,
      mode: 'development',
      build: {},
      server: { hmr: true },
      plugins: [],
    });
    await (plugin.buildStart as any).call({
      addWatchFile: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
    });

    // The transform hook should return compiled output for the emitted file
    const transformHandler =
      typeof (plugin.transform as any) === 'function'
        ? (plugin.transform as any)
        : (plugin.transform as any).handler;

    const result = await transformHandler.call(
      { warn: vi.fn(), error: vi.fn() },
      `@Component({ template: '<div></div>' }) export class AppComponent {}`,
      testFile,
    );

    expect(result).toBeDefined();
    expect(result.code).toBe('compiled output');
  });

  it('serves emitted output for TypeScript files without Angular decorators', async () => {
    const configFile = join(tempRoot, 'src/app.config.ts');
    createAngularCompilationMock.mockResolvedValue({
      initialize: vi.fn().mockResolvedValue({
        externalStylesheets: new Map(),
        templateUpdates: new Map(),
      }),
      update: vi.fn(),
      diagnoseFiles: vi.fn().mockResolvedValue({ errors: [], warnings: [] }),
      emitAffectedFiles: vi
        .fn()
        .mockResolvedValue([
          { filename: configFile, contents: 'export const appConfig = {};' },
        ]),
    });

    const plugin = getCompilerPlugin({
      tsconfig: () => join(tempRoot, 'tsconfig.json'),
      workspaceRoot: tempRoot,
      inlineStylesExtension: 'css',
      jit: false,
      liveReload: true,
      disableTypeChecking: true,
      supportedBrowsers: ['safari 15'],
      fileReplacements: [],
      include: [],
    });

    await (plugin.config as any)(
      { root: tempRoot, mode: 'development' },
      { command: 'serve', mode: 'development' },
    );
    await (plugin.configResolved as any)({
      cacheDir: join(tempRoot, '.vite'),
      root: tempRoot,
      mode: 'development',
      build: {},
      server: { hmr: true },
      plugins: [],
    });
    await (plugin.buildStart as any).call({
      addWatchFile: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
    });

    const warn = vi.fn();
    const result = await (plugin.transform as any).handler.call(
      { warn, error: vi.fn() },
      `import type { ApplicationConfig } from '@angular/core';\nexport const appConfig: ApplicationConfig = {};`,
      configFile,
    );

    expect(result.code).toBe('export const appConfig = {};');
    expect(warn).not.toHaveBeenCalled();
  });
  it('exports a complete plugin set with one compiler and one HMR middleware', () => {
    const plugins = angularCompilationPlugin();
    const names = plugins.map((plugin) => plugin.name);
    expect(
      names.filter(
        (name) => name === '@analogjs/vite-plugin-angular-compilation-api',
      ),
    ).toHaveLength(1);
    expect(
      names.filter((name) => name === 'analogjs-live-reload-plugin'),
    ).toHaveLength(1);
    expect(names).not.toContain('@analogjs/vite-plugin-angular');
    expect(
      angularCompilationPlugin({ liveReload: false }).map(
        (plugin) => plugin.name,
      ),
    ).not.toContain('analogjs-live-reload-plugin');
  });

  it.each([
    [200000, createAngularCompilationMock],
    [200100, undefined],
  ])(
    'rejects an unsupported Compilation API (%s)',
    async (version, createCompilation) => {
      vi.resetModules();
      vi.doMock('../utils/devkit.js', () => ({
        ...cachedDevkitActual,
        angularFullVersion: version,
        createAngularCompilation: createCompilation,
      }));
      const { angularCompilationPlugin: unsupportedPlugin } =
        await import('../../index.js');
      expect(() => unsupportedPlugin()).toThrow(
        'requires Angular v20.1 or later',
      );
    },
  );

  it('shares HMR output with its middleware and keeps instances isolated', async () => {
    const filename = join(tempRoot, 'app.component.ts');
    const hmrCode = 'export const update = true;';
    createAngularCompilationMock.mockResolvedValue({
      initialize: vi.fn().mockResolvedValue({
        templateUpdates: new Map([
          [encodeURIComponent(filename) + '@AppComponent', hmrCode],
        ]),
      }),
      diagnoseFiles: vi.fn().mockResolvedValue({ errors: [], warnings: [] }),
      emitAffectedFiles: vi
        .fn()
        .mockResolvedValue([{ filename, contents: 'compiled' }]),
      close: vi.fn(),
    });
    const options = { tsconfig: join(tempRoot, 'tsconfig.json'), jit: false };
    const first = angularCompilationPlugin(options);
    const second = angularCompilationPlugin(options);
    const compiler = first.find(
      (plugin) =>
        plugin.name === '@analogjs/vite-plugin-angular-compilation-api',
    )!;
    await configure(compiler);
    await (compiler.buildStart as any)();
    const request =
      'file:///@ng/component?c=' +
      encodeURIComponent(filename + '@AppComponent');
    const firstMiddleware = first.find(
      (plugin) => plugin.name === 'analogjs-live-reload-plugin',
    )!;
    const secondMiddleware = second.find(
      (plugin) => plugin.name === 'analogjs-live-reload-plugin',
    )!;
    expect((firstMiddleware.load as any)('\0' + request, { ssr: true })).toBe(
      hmrCode,
    );
    expect((secondMiddleware.load as any)('\0' + request, { ssr: true })).toBe(
      '',
    );
    await (compiler.closeBundle as any)();
    expect((firstMiddleware.load as any)('\0' + request, { ssr: true })).toBe(
      '',
    );
  });

  it('waits for initial compilation, preserves raw imports, and awaits cleanup', async () => {
    const filename = join(tempRoot, 'app.ts');
    let finishInitialize!: () => void;
    const initialize = vi.fn(
      () =>
        new Promise<object>((resolve) => {
          finishInitialize = () => resolve({});
        }),
    );
    let finishClose!: () => void;
    const close = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishClose = resolve;
        }),
    );
    createAngularCompilationMock.mockResolvedValue({
      initialize,
      diagnoseFiles: vi.fn().mockResolvedValue({ errors: [], warnings: [] }),
      emitAffectedFiles: vi
        .fn()
        .mockResolvedValue([{ filename, contents: 'compiled' }]),
      close,
    });
    const compiler = getCompilerPlugin({
      tsconfig: join(tempRoot, 'tsconfig.json'),
      jit: false,
    });
    await configure(compiler);
    const building = (compiler.buildStart as any)();
    await vi.waitFor(() => expect(initialize).toHaveBeenCalledOnce());
    const transform = (compiler.transform as any).handler;
    const context = { warn: vi.fn(), error: vi.fn() };
    await expect(
      transform.call(context, 'export default "source";', filename + '?raw'),
    ).resolves.toBeUndefined();
    let transformed = false;
    const transforming = transform
      .call(context, 'source', filename + '?component')
      .then((result: any) => {
        transformed = true;
        return result;
      });
    await Promise.resolve();
    expect(transformed).toBe(false);
    finishInitialize();
    await building;
    await expect(transforming).resolves.toEqual({
      code: 'compiled',
      map: null,
    });
    let closed = false;
    const closing = (compiler.closeBundle as any)().then(() => {
      closed = true;
    });
    await vi.waitFor(() => expect(close).toHaveBeenCalledOnce());
    expect(closed).toBe(false);
    finishClose();
    await closing;
    expect(closed).toBe(true);
  });
});
