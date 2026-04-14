import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

async function setupLiveReloadPlugin(options: {
  include?: string[];
  stylePreprocessor?: (
    code: string,
    filename: string,
    context?: unknown,
  ) => string;
  stylePipeline?: {
    plugins: Array<{
      name: string;
      preprocessStylesheet?: (code: string, context: unknown) => string;
    }>;
  };
  tsconfig?: string;
  workspaceRoot?: string;
}) {
  vi.resetModules();
  preprocessCSSMock.mockReset();
  createAngularCompilationMock.mockReset();
  process.env['NODE_ENV'] = 'development';
  delete process.env['VITEST'];

  const resolvedWorkspaceRoot = options.workspaceRoot ?? workspaceRoot;
  const resolvedTsconfig =
    options.tsconfig ?? `${resolvedWorkspaceRoot}/tsconfig.base.json`;
  const resolvedCacheDir = join(
    resolvedWorkspaceRoot,
    'node_modules/.vite/live-reload-spec',
  );

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
    include: options.include,
    tsconfig: resolvedTsconfig,
    hmr: true,
    inlineStylesExtension: 'css',
    stylePreprocessor: options.stylePreprocessor,
    stylePipeline: options.stylePipeline,
    workspaceRoot: resolvedWorkspaceRoot,
    experimental: {
      useAngularCompilationAPI: true,
    },
  }).find((entry) => entry.name === '@analogjs/vite-plugin-angular') as any;

  await plugin.config(
    {
      root: resolvedWorkspaceRoot,
      mode: 'development',
    },
    { command: 'serve', mode: 'development' },
  );
  await plugin.configResolved({
    cacheDir: resolvedCacheDir,
    root: resolvedWorkspaceRoot,
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
    initialize,
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

      const { plugin, transformStylesheet } = await setupLiveReloadPlugin({
        stylePreprocessor,
      });

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
        {
          filename: '/project/src/app/demo.component.css',
          containingFile: '/project/src/app/demo.component.ts',
          resourceFile: '/project/src/app/demo.component.css',
          className: 'DemoComponent',
          order: 0,
          inline: false,
        },
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
        {
          filename: '/project/src/app/demo.component.css',
          containingFile: '/project/src/app/demo.component.ts',
          resourceFile: undefined,
          className: 'DemoComponent',
          order: 1,
          inline: true,
        },
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

    const { plugin, transformStylesheet } = await setupLiveReloadPlugin({
      stylePreprocessor: prepender,
    });
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

  it(
    'runs style-pipeline preprocessors for inline styles in the compilation API path',
    { timeout: 15_000 },
    async () => {
      const preprocessStylesheet = vi.fn(
        (code: string, context: any) =>
          `/* ${context.filename} ${context.className} ${context.order} */\n${code}`,
      );

      const { plugin, transformStylesheet } = await setupLiveReloadPlugin({
        stylePipeline: {
          plugins: [
            {
              name: 'pipeline-a',
              preprocessStylesheet,
            },
          ],
        },
      });

      const initialId = await transformStylesheet(
        '.demo { color: red; }',
        '/project/src/app/demo.component.ts',
        undefined,
        1,
        'DemoComponent',
      );

      expect(preprocessStylesheet).toHaveBeenCalledWith(
        '.demo { color: red; }',
        {
          filename: '/project/src/app/demo.component.css',
          containingFile: '/project/src/app/demo.component.ts',
          resourceFile: undefined,
          className: 'DemoComponent',
          order: 1,
          inline: true,
        },
      );
      expect(await plugin.load(`${initialId}?ngcomp=ng-c123&e=0`)).toBe(
        '/* /project/src/app/demo.component.css DemoComponent 1 */\n.demo { color: red; }',
      );

      preprocessStylesheet.mockClear();

      const updatedId = await transformStylesheet(
        '.demo { color: blue; }',
        '/project/src/app/demo.component.ts',
        undefined,
        1,
        'DemoComponent',
      );

      expect(preprocessStylesheet).toHaveBeenCalledWith(
        '.demo { color: blue; }',
        {
          filename: '/project/src/app/demo.component.css',
          containingFile: '/project/src/app/demo.component.ts',
          resourceFile: undefined,
          className: 'DemoComponent',
          order: 1,
          inline: true,
        },
      );
      expect(await plugin.load(`${updatedId}?ngcomp=ng-c123&e=0`)).toBe(
        '/* /project/src/app/demo.component.css DemoComponent 1 */\n.demo { color: blue; }',
      );
    },
  );

  it(
    'wraps the compilation API tsconfig when include adds extra source roots',
    { timeout: 15_000 },
    async () => {
      const tempWorkspaceRoot = mkdtempSync(
        join(tmpdir(), 'analog-compilation-api-include-'),
      );
      const normalize = (value: string) => value.replaceAll('\\', '/');

      try {
        mkdirSync(join(tempWorkspaceRoot, 'src/app'), { recursive: true });
        mkdirSync(join(tempWorkspaceRoot, 'libs/shared/feature/src'), {
          recursive: true,
        });

        writeFileSync(
          join(tempWorkspaceRoot, 'src/app/app.component.ts'),
          'export const app = true;\n',
        );
        writeFileSync(
          join(
            tempWorkspaceRoot,
            'libs/shared/feature/src/feature.component.ts',
          ),
          'export const feature = true;\n',
        );
        writeFileSync(
          join(tempWorkspaceRoot, 'tsconfig.base.json'),
          JSON.stringify(
            {
              compilerOptions: {
                module: 'esnext',
                moduleResolution: 'bundler',
                target: 'es2022',
              },
              files: ['./src/app/app.component.ts'],
            },
            null,
            2,
          ),
        );

        const { initialize } = await setupLiveReloadPlugin({
          include: ['libs/shared/feature/src/**/*.ts'],
          tsconfig: join(tempWorkspaceRoot, 'tsconfig.base.json'),
          workspaceRoot: tempWorkspaceRoot,
        });

        // The wrapper tsconfig is the value of this feature: Angular sees the
        // extra include roots without us mutating the user's checked-in config.
        const [generatedTsconfigPath] = initialize.mock.calls[0] as [string];
        expect(normalize(generatedTsconfigPath)).not.toBe(
          normalize(join(tempWorkspaceRoot, 'tsconfig.base.json')),
        );

        const generatedConfig = JSON.parse(
          readFileSync(generatedTsconfigPath, 'utf-8'),
        ) as { extends: string; files: string[] };

        expect(generatedConfig.extends).toBe(
          normalize(join(tempWorkspaceRoot, 'tsconfig.base.json')),
        );
        expect(generatedConfig.files).toEqual(
          expect.arrayContaining([
            normalize(join(tempWorkspaceRoot, 'src/app/app.component.ts')),
            normalize(
              join(
                tempWorkspaceRoot,
                'libs/shared/feature/src/feature.component.ts',
              ),
            ),
          ]),
        );
      } finally {
        rmSync(tempWorkspaceRoot, { force: true, recursive: true });
      }
    },
  );
});
