import { required } from '../../testing/required.test-support.js';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const createAngularCompilationMock = vi.fn();
const preprocessCSSMock = vi.fn();
const originalNodeEnv = process.env['NODE_ENV'];
const originalVitestEnv = process.env['VITEST'];

let cachedViteActual: typeof import('vite');
let cachedDevkitActual: typeof import('../utils/devkit.js');

describe('compilationAPIPlugin', () => {
  let tempRoot: string;

  beforeEach(async () => {
    process.env['NODE_ENV'] = 'development';
    delete process.env['VITEST'];
    vi.resetModules();

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
  });

  afterEach(() => {
    process.env['NODE_ENV'] = originalNodeEnv;
    if (originalVitestEnv !== undefined) {
      process.env['VITEST'] = originalVitestEnv;
    }
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
    const { compilationAPIPlugin } =
      await import('./compilation-api-plugin.js');
    const plugin = compilationAPIPlugin({
      tsconfigGetter: () => join(tempRoot, 'tsconfig.json'),
      workspaceRoot: tempRoot,
      inlineStylesExtension: 'css',
      jit: false,
      liveReload: true,
      disableTypeChecking: true,
      supportedBrowsers: ['safari 15'],
      fileReplacements: [],
      isTest: false,
      isAstroIntegration: false,
      include: [],
    });

    expect(plugin.name).toBe('@analogjs/vite-plugin-angular-compilation-api');
    expect(plugin.enforce).toBe('pre');
  });

  it('has required Vite plugin hooks', async () => {
    const { compilationAPIPlugin } =
      await import('./compilation-api-plugin.js');
    const plugin = compilationAPIPlugin({
      tsconfigGetter: () => join(tempRoot, 'tsconfig.json'),
      workspaceRoot: tempRoot,
      inlineStylesExtension: 'css',
      jit: false,
      liveReload: true,
      disableTypeChecking: true,
      supportedBrowsers: ['safari 15'],
      fileReplacements: [],
      isTest: false,
      isAstroIntegration: false,
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

  it.each([
    { test: false, astro: false },
    { test: false, astro: true },
    { test: true, astro: false },
    { test: true, astro: true },
  ])(
    'separates test mode from transformer ownership (%j)',
    async ({ test, astro }) => {
      process.env['NODE_ENV'] = test ? 'test' : 'development';
      if (test) process.env['VITEST'] = 'true';
      const { compilationAPIPlugin } =
        await import('./compilation-api-plugin.js');
      const plugin = compilationAPIPlugin({
        tsconfigGetter: () => join(tempRoot, 'tsconfig.json'),
        workspaceRoot: tempRoot,
        inlineStylesExtension: 'css',
        jit: false,
        liveReload: true,
        disableTypeChecking: true,
        supportedBrowsers: ['safari 15'],
        fileReplacements: [],
        isTest: test,
        isAstroIntegration: astro,
        include: [],
      });

      const result = await (plugin.config as any)(
        { root: tempRoot, mode: 'development' },
        { command: 'serve', mode: 'development' },
      );

      expect(result.esbuild).toBe(false);
      expect(result.oxc).toBe(false);
      const dependencyPlugin = result.optimizeDeps.rolldownOptions.plugins[0];
      expect(dependencyPlugin.load !== undefined).toBe(!test);
      expect(typeof dependencyPlugin.buildEnd).toBe(
        astro ? 'undefined' : 'function',
      );
    },
  );

  it('waits for buildStart compilation before transforming an emitted module', async () => {
    const initializeMock = vi.fn().mockResolvedValue({
      externalStylesheets: new Map(),
      templateUpdates: new Map(),
    });
    const diagnoseFilesMock = vi
      .fn()
      .mockResolvedValue({ errors: [], warnings: [] });
    const emitted =
      Promise.withResolvers<{ filename: string; contents: string }[]>();
    const close = vi.fn();
    const emitAffectedFilesMock = vi
      .fn()
      .mockImplementation(() => emitted.promise);

    createAngularCompilationMock.mockResolvedValue({
      initialize: initializeMock,
      update: vi.fn(),
      diagnoseFiles: diagnoseFilesMock,
      emitAffectedFiles: emitAffectedFilesMock,
      close,
    });

    const { compilationAPIPlugin } =
      await import('./compilation-api-plugin.js');
    const plugin = compilationAPIPlugin({
      tsconfigGetter: () => join(tempRoot, 'tsconfig.json'),
      workspaceRoot: tempRoot,
      inlineStylesExtension: 'css',
      jit: false,
      liveReload: false,
      disableTypeChecking: true,
      supportedBrowsers: ['safari 15'],
      fileReplacements: [],
      isTest: false,
      isAstroIntegration: false,
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
    const building = (plugin.buildStart as any).call({
      addWatchFile: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
    });

    await vi.waitFor(() =>
      expect(emitAffectedFilesMock).toHaveBeenCalledOnce(),
    );
    const filename = join(tempRoot, 'main.ts');
    const transformed = (plugin.transform as any).handler.call(
      { warn: vi.fn(), error: vi.fn() },
      'export const value = 1;',
      filename,
    );
    const closing = (plugin.closeBundle as any)();
    await Promise.resolve();
    expect(close).not.toHaveBeenCalled();
    emitted.resolve([{ filename, contents: 'export const value = 1;' }]);
    await building;
    await closing;
    await expect(transformed).resolves.toMatchObject({
      code: 'export const value = 1;',
    });

    expect(createAngularCompilationMock).toHaveBeenCalledOnce();
    expect(initializeMock).toHaveBeenCalledOnce();
    expect(emitAffectedFilesMock).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
  });

  it('includes integration-provided files outside the configured TypeScript roots', async () => {
    const main = join(tempRoot, 'main.ts');
    const extra = join(tempRoot, 'integration.ts');
    writeFileSync(main, 'export const main = 1;');
    writeFileSync(extra, 'export const integration = 2;');
    writeFileSync(
      join(tempRoot, 'tsconfig.json'),
      JSON.stringify({
        files: ['main.ts'],
        compilerOptions: { target: 'es2022' },
      }),
    );
    const initialize = vi.fn(async (_tsconfig: string) => ({
      externalStylesheets: new Map(),
      templateUpdates: new Map(),
    }));
    createAngularCompilationMock.mockResolvedValue({
      initialize,
      diagnoseFiles: vi.fn().mockResolvedValue({ errors: [], warnings: [] }),
      emitAffectedFiles: vi.fn().mockResolvedValue([]),
    });
    const { compilationAPIPlugin } =
      await import('./compilation-api-plugin.js');
    const plugin = compilationAPIPlugin({
      tsconfigGetter: () => join(tempRoot, 'tsconfig.json'),
      workspaceRoot: tempRoot,
      inlineStylesExtension: 'css',
      jit: false,
      liveReload: false,
      disableTypeChecking: true,
      supportedBrowsers: ['safari 15'],
      fileReplacements: [],
      isTest: false,
      isAstroIntegration: false,
      include: [extra],
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
    const wrapper = JSON.parse(
      readFileSync(required(initialize.mock.calls[0])[0], 'utf8'),
    );
    expect(wrapper.files).toEqual(
      expect.arrayContaining([
        cachedViteActual.normalizePath(main),
        cachedViteActual.normalizePath(extra),
      ]),
    );
  });

  it('consumes an iterable compilation result without requiring an array', async () => {
    const filename = join(tempRoot, 'main.ts');
    const secondFilename = join(tempRoot, 'second.ts');
    const outputFiles = new Map();
    createAngularCompilationMock.mockResolvedValue({
      initialize: vi.fn().mockResolvedValue({
        externalStylesheets: new Map(),
        templateUpdates: new Map(),
      }),
      diagnoseFiles: vi.fn().mockResolvedValue({
        errors: [{ text: 'compilation error' }],
        warnings: [{ text: 'compilation warning' }],
      }),
      emitAffectedFiles: vi.fn(function* () {
        yield { filename, contents: 'export const fromCompiler = true;' };
        yield {
          filename: secondFilename,
          contents: 'export const second = true;',
        };
      }),
    });
    const { compilationAPIPlugin } =
      await import('./compilation-api-plugin.js');
    const plugin = compilationAPIPlugin(
      {
        tsconfigGetter: () => join(tempRoot, 'tsconfig.json'),
        workspaceRoot: tempRoot,
        inlineStylesExtension: 'css',
        jit: false,
        liveReload: false,
        disableTypeChecking: true,
        supportedBrowsers: ['safari 15'],
        fileReplacements: [],
        isTest: false,
        isAstroIntegration: false,
        include: [],
      },
      { outputFiles, classNames: new Map() },
    );
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
    const result = await (plugin.transform as any).handler.call(
      { warn: vi.fn(), error: vi.fn() },
      'export const raw = true;',
      filename,
    );
    expect(result.code).toBe('export const fromCompiler = true;');
    const firstOutput = outputFiles.get(filename)!;
    const secondOutput = outputFiles.get(secondFilename)!;
    expect(firstOutput.errors).toEqual(['compilation error']);
    expect(firstOutput.warnings).toEqual(['compilation warning']);
    expect(firstOutput.errors).toBe(secondOutput.errors);
    expect(firstOutput.warnings).toBe(secondOutput.warnings);
  });

  it('hands the stylesheet registry to analog.setup configurators', async () => {
    const configure = vi.fn();
    const { compilationAPIPlugin } =
      await import('./compilation-api-plugin.js');
    const plugin = compilationAPIPlugin({
      tsconfigGetter: () => join(tempRoot, 'tsconfig.json'),
      workspaceRoot: tempRoot,
      inlineStylesExtension: 'css',
      jit: false,
      liveReload: false,
      disableTypeChecking: true,
      supportedBrowsers: ['safari 15'],
      fileReplacements: [],
      isTest: false,
      isAstroIntegration: false,
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

    const { compilationAPIPlugin } =
      await import('./compilation-api-plugin.js');
    const plugin = compilationAPIPlugin({
      tsconfigGetter: () => join(tempRoot, 'tsconfig.json'),
      workspaceRoot: tempRoot,
      inlineStylesExtension: 'css',
      jit: false,
      liveReload: false,
      disableTypeChecking: true,
      supportedBrowsers: ['safari 15'],
      fileReplacements: [],
      isTest: false,
      isAstroIntegration: false,
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
    const update = vi.fn();
    const initializeMock = vi.fn().mockResolvedValue({
      externalStylesheets: new Map([[join(tempRoot, 'src/view.css'), 'view']]),
      templateUpdates: new Map([
        [
          encodeURIComponent(`${testFile}@AppComponent`),
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
      update,
      diagnoseFiles: vi.fn().mockResolvedValue({ errors: [], warnings: [] }),
      emitAffectedFiles: emitAffectedFilesMock,
    });

    const { compilationAPIPlugin } =
      await import('./compilation-api-plugin.js');
    const plugin = compilationAPIPlugin({
      tsconfigGetter: () => join(tempRoot, 'tsconfig.json'),
      workspaceRoot: tempRoot,
      inlineStylesExtension: 'css',
      jit: false,
      liveReload: true,
      componentStyleHmr: 'metadata',
      disableTypeChecking: true,
      supportedBrowsers: ['safari 15'],
      fileReplacements: [],
      isTest: false,
      isAstroIntegration: false,
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

    const clientModule = { isSelfAccepting: false };
    const mixedModule = {
      id: testFile,
      get isSelfAccepting() {
        return clientModule.isSelfAccepting;
      },
    };
    const send = vi.fn();
    const modules = await (plugin.handleHotUpdate as any)({
      file: testFile,
      modules: [mixedModule],
      server: {
        ws: { send },
        environments: {
          client: { moduleGraph: { getModuleById: () => clientModule } },
        },
      },
    });
    expect(modules).toEqual([mixedModule]);
    expect(clientModule.isSelfAccepting).toBe(true);
    expect(send).toHaveBeenCalled();

    send.mockClear();
    emitAffectedFilesMock.mockResolvedValue([]);
    const templateFile = join(tempRoot, 'src/app.component.html');
    const invalidateModule = vi.fn();
    await (plugin.handleHotUpdate as any)({
      file: templateFile,
      modules: [],
      server: {
        ws: { send },
        environments: {
          client: {
            moduleGraph: {
              getModuleById: () => clientModule,
              invalidateModule,
            },
          },
        },
      },
    });
    expect(update).toHaveBeenLastCalledWith(new Set([templateFile]));
    expect(invalidateModule).toHaveBeenCalledWith(clientModule);
    expect(send).toHaveBeenCalled();
    const stylesheet = { id: `${tempRoot}/src/view.css?direct&ngcomp=app&e=0` };
    for (let edit = 0; edit < 2; edit++) {
      send.mockClear();
      const invalidateStyle = vi.fn();
      const result = await (plugin.handleHotUpdate as any)({
        file: `${tempRoot}/src/view.css`,
        modules: [stylesheet],
        server: {
          ws: { send },
          moduleGraph: { invalidateModule: invalidateStyle },
        },
      });
      expect(result).toEqual([]);
      expect(invalidateStyle).toHaveBeenCalledWith(stylesheet);
      expect(send).toHaveBeenCalledWith({ type: 'full-reload' });
    }
    // Browser-cached CSS may not enter the new module graph after a restart.
    send.mockClear();
    expect(
      await (plugin.handleHotUpdate as any)({
        file: join(tempRoot, 'src/view.css'),
        modules: [],
        server: { ws: { send } },
      }),
    ).toEqual([]);
    expect(send).toHaveBeenCalledWith({ type: 'full-reload' });
    send.mockClear();
    const globalCss = { id: `${tempRoot}/src/global.css` };
    expect(
      await (plugin.handleHotUpdate as any)({
        file: globalCss.id,
        modules: [globalCss],
        server: { ws: { send } },
      }),
    ).toEqual([globalCss]);
    expect(send).not.toHaveBeenCalled();
    await expect(
      transformHandler.call(
        { warn: vi.fn(), error: vi.fn() },
        'source text',
        testFile,
      ),
    ).resolves.toMatchObject({ code: 'compiled output' });
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

    const { compilationAPIPlugin } =
      await import('./compilation-api-plugin.js');
    const plugin = compilationAPIPlugin({
      tsconfigGetter: () => join(tempRoot, 'tsconfig.json'),
      workspaceRoot: tempRoot,
      inlineStylesExtension: 'css',
      jit: false,
      liveReload: true,
      disableTypeChecking: true,
      supportedBrowsers: ['safari 15'],
      fileReplacements: [],
      isTest: false,
      isAstroIntegration: false,
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
});
