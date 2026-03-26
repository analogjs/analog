import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const preprocessCSSMock = vi.fn();
const createAngularCompilationMock = vi.fn();
const workspaceRoot = '/workspace/analog';
const originalNodeEnv = process.env['NODE_ENV'];
const originalVitestEnv = process.env['VITEST'];

async function setupLiveReloadPlugin(
  stylePreprocessor: (code: string, filename: string) => string,
) {
  vi.resetModules();
  preprocessCSSMock.mockReset();
  createAngularCompilationMock.mockReset();
  process.env['NODE_ENV'] = 'development';
  delete process.env['VITEST'];

  vi.doMock('vite', async () => {
    const actual = await vi.importActual<typeof import('vite')>('vite');
    return {
      ...actual,
      preprocessCSS: preprocessCSSMock,
    };
  });

  vi.doMock('./utils/devkit.js', async () => {
    const actual =
      await vi.importActual<typeof import('./utils/devkit.js')>(
        './utils/devkit.js',
      );
    return {
      ...actual,
      angularFullVersion: 200100,
      createAngularCompilation: createAngularCompilationMock,
    };
  });

  const initialize = vi.fn();
  createAngularCompilationMock.mockResolvedValue({
    initialize,
    update: vi.fn(),
    diagnoseFiles: vi.fn().mockResolvedValue({ errors: [], warnings: [] }),
    emitAffectedFiles: vi.fn().mockResolvedValue([]),
  });

  let transformStylesheet:
    | ((
        data: string,
        containingFile: string,
        resourceFile: string | undefined,
        order: number,
        className: string,
      ) => Promise<string>)
    | undefined;

  initialize.mockImplementation(async (_tsconfigPath, hostOptions) => {
    transformStylesheet = hostOptions.transformStylesheet;
    return {
      externalStylesheets: new Map(),
      templateUpdates: new Map(),
    };
  });

  const { angular } = await import('./angular-vite-plugin');
  const plugin = angular({
    tsconfig: `${workspaceRoot}/tsconfig.base.json`,
    liveReload: true,
    inlineStylesExtension: 'css',
    stylePreprocessor,
    experimental: {
      useAngularCompilationAPI: true,
    },
  }).find((entry) => entry.name === '@analogjs/vite-plugin-angular') as any;

  await plugin.config(
    {
      root: workspaceRoot,
      mode: 'development',
    },
    { command: 'serve', mode: 'development' },
  );
  await plugin.configResolved({
    root: workspaceRoot,
    mode: 'development',
    build: {},
    server: {},
    plugins: [],
  });
  await plugin.buildStart.call({
    addWatchFile: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  });

  expect(transformStylesheet).toBeTypeOf('function');

  return {
    plugin,
    transformStylesheet: transformStylesheet!,
  };
}

describe('angular liveReload style preprocessing', () => {
  beforeEach(() => {
    process.env['NODE_ENV'] = 'development';
    delete process.env['VITEST'];
  });

  afterEach(() => {
    vi.doUnmock('vite');
    vi.doUnmock('./utils/devkit.js');

    if (originalNodeEnv === undefined) {
      delete process.env['NODE_ENV'];
    } else {
      process.env['NODE_ENV'] = originalNodeEnv;
    }

    if (originalVitestEnv === undefined) {
      delete process.env['VITEST'];
    } else {
      process.env['VITEST'] = originalVitestEnv;
    }
  });

  it('preprocesses external stylesheets before liveReload transforms them', async () => {
    const stylePreprocessor = vi.fn(
      (code: string, filename: string) => `/* ${filename} */\n${code}`,
    );

    const { plugin, transformStylesheet } =
      await setupLiveReloadPlugin(stylePreprocessor);
    const stylesheetId = await transformStylesheet(
      '.demo { color: red; }',
      '/project/src/app/demo.component.ts',
      '/project/src/app/demo.component.css',
      0,
      'DemoComponent',
    );

    expect(stylePreprocessor).toHaveBeenCalledWith(
      '.demo { color: red; }',
      '/project/src/app/demo.component.css',
    );
    // preprocessCSS is NOT called during compilation; Vite processes
    // the CSS at serve time when the load hook returns it.
    expect(preprocessCSSMock).not.toHaveBeenCalled();
    expect(await plugin.load(`${stylesheetId}?ngcomp=ng-c123&e=0`)).toBe(
      '/* /project/src/app/demo.component.css */\n.demo { color: red; }',
    );
  });

  it('preprocesses inline stylesheets before liveReload transforms them', async () => {
    const stylePreprocessor = vi.fn(
      (code: string, filename: string) => `/* ${filename} */\n${code}`,
    );

    const { plugin, transformStylesheet } =
      await setupLiveReloadPlugin(stylePreprocessor);
    const stylesheetId = await transformStylesheet(
      '.demo { display: grid; }',
      '/project/src/app/demo.component.ts',
      undefined,
      1,
      'DemoComponent',
    );

    expect(stylePreprocessor).toHaveBeenCalledWith(
      '.demo { display: grid; }',
      '/project/src/app/demo.component.css',
    );
    // preprocessCSS is NOT called during compilation; Vite processes
    // the CSS at serve time when the load hook returns it.
    expect(preprocessCSSMock).not.toHaveBeenCalled();
    expect(await plugin.load(`${stylesheetId}?ngcomp=ng-c123&e=0`)).toBe(
      '/* /project/src/app/demo.component.css */\n.demo { display: grid; }',
    );
  });
});
