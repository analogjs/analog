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
      hasTailwindCss: false,
      isTest: false,
      isAstroIntegration: false,
      include: [],
      additionalContentDirs: [],
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
      hasTailwindCss: false,
      isTest: false,
      isAstroIntegration: false,
      include: [],
      additionalContentDirs: [],
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
      hasTailwindCss: false,
      isTest: false,
      isAstroIntegration: false,
      include: [],
      additionalContentDirs: [],
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
      hasTailwindCss: false,
      isTest: false,
      isAstroIntegration: false,
      include: [],
      additionalContentDirs: [],
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
      hasTailwindCss: false,
      isTest: false,
      isAstroIntegration: false,
      include: [],
      additionalContentDirs: [],
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
});
