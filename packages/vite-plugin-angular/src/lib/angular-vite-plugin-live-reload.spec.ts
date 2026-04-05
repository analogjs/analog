import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const preprocessCSSMock = vi.fn();
const createAngularCompilationMock = vi.fn();
const workspaceRoot = '/workspace/analog';
const originalNodeEnv = process.env['NODE_ENV'];
const originalVitestEnv = process.env['VITEST'];

// Cache the real module exports once so vi.doMock factories can be
// synchronous.  Async factories inside vi.doMock can race with
// vi.resetModules in CI, causing the real createAngularCompilation to
// leak through and spawn piscina workers that fail on the missing tsconfig.
let cachedViteActual: typeof import('vite');
let cachedDevkitActual: typeof import('./utils/devkit.js');

async function setupLiveReloadPlugin(
  stylePreprocessor: (code: string, filename: string) => string,
) {
  vi.resetModules();
  preprocessCSSMock.mockReset();
  createAngularCompilationMock.mockReset();
  process.env['NODE_ENV'] = 'development';
  delete process.env['VITEST'];

  cachedViteActual ??= await vi.importActual<typeof import('vite')>('vite');
  cachedDevkitActual ??=
    await vi.importActual<typeof import('./utils/devkit.js')>(
      './utils/devkit.js',
    );

  vi.doMock('vite', () => ({
    ...cachedViteActual,
    preprocessCSS: preprocessCSSMock,
  }));

  vi.doMock('./utils/devkit.js', () => ({
    ...cachedDevkitActual,
    angularFullVersion: 200100,
    createAngularCompilation: createAngularCompilationMock,
  }));

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
    hmr: true,
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

describe('angular hmr style preprocessing', () => {
  beforeEach(() => {
    process.env['NODE_ENV'] = 'development';
    delete process.env['VITEST'];
  });

  afterEach(() => {
    vi.doUnmock('vite');
    vi.doUnmock('./utils/devkit.js');
    vi.doUnmock('node:fs');

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

  // First run pays the cold-start cost of dynamically importing the full
  // plugin module graph after vi.resetModules(); CI can exceed the default 5s.
  it(
    'preprocesses external and inline stylesheets before HMR serves them through Vite',
    { timeout: 15_000 },
    async () => {
      const stylePreprocessor = vi.fn(
        (code: string, filename: string) => `/* ${filename} */\n${code}`,
      );

      const { plugin, transformStylesheet } =
        await setupLiveReloadPlugin(stylePreprocessor);

      // External stylesheet (resourceFile provided)
      const externalId = await transformStylesheet(
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
      expect(await plugin.load(`${externalId}?ngcomp=ng-c123&e=0`)).toBe(
        '/* /project/src/app/demo.component.css */\n.demo { color: red; }',
      );

      // Inline stylesheet (no resourceFile — filename derived from containingFile)
      stylePreprocessor.mockClear();
      const inlineId = await transformStylesheet(
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
      expect(await plugin.load(`${inlineId}?ngcomp=ng-c123&e=0`)).toBe(
        '/* /project/src/app/demo.component.css */\n.demo { display: grid; }',
      );

      // preprocessCSS is NOT called during compilation; Vite processes
      // the CSS at serve time when the load hook returns it.
      expect(preprocessCSSMock).not.toHaveBeenCalled();
    },
  );

  it('prepends content via stylePreprocessor through the HMR stylesheet path', async () => {
    const prepender = (code: string, _filename: string) =>
      `@reference "../styles/tailwind.css";\n${code}`;

    const { plugin, transformStylesheet } =
      await setupLiveReloadPlugin(prepender);
    const stylesheetId = await transformStylesheet(
      '.demo { @apply sa:text-red-500; }',
      '/project/src/app/demo.component.ts',
      '/project/src/app/demo.component.css',
      0,
      'DemoComponent',
    );

    expect(preprocessCSSMock).not.toHaveBeenCalled();
    expect(await plugin.load(`${stylesheetId}?ngcomp=ng-c123&e=0`)).toBe(
      '@reference "../styles/tailwind.css";\n.demo { @apply sa:text-red-500; }',
    );
  });
});
