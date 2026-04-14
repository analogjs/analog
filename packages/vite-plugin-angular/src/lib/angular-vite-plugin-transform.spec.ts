import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const originalNodeEnv = process.env['NODE_ENV'];
const originalVitestEnv = process.env['VITEST'];
const temporaryWorkspaceRoots = new Set<string>();

async function setupLegacyTransformPlugin() {
  vi.resetModules();
  process.env['NODE_ENV'] = 'test';
  process.env['VITEST'] = 'true';

  const workspaceRoot = mkdtempSync(join(tmpdir(), 'analog-transform-'));
  temporaryWorkspaceRoots.add(workspaceRoot);
  mkdirSync(join(workspaceRoot, 'src', 'app'), { recursive: true });
  const tsconfigPath = join(workspaceRoot, 'tsconfig.app.json');
  writeFileSync(tsconfigPath, '{\n  "compilerOptions": {}\n}\n', 'utf-8');

  const mockBuilder = {
    emit: vi.fn(),
    emitNextAffectedFile: vi.fn().mockReturnValue(false),
    getProgram: vi.fn().mockReturnValue({
      getTypeChecker: vi.fn(),
    }),
    getSourceFile: vi.fn().mockReturnValue(undefined),
  };

  vi.doMock('typescript', () => ({
    sys: {
      readFile: vi.fn(),
    },
    readBuilderProgram: vi.fn().mockReturnValue(undefined),
    createAbstractBuilder: vi.fn().mockReturnValue(mockBuilder),
    createEmitAndSemanticDiagnosticsBuilderProgram: vi
      .fn()
      .mockReturnValue(mockBuilder),
    createIncrementalCompilerHost: vi.fn().mockReturnValue({}),
  }));

  vi.doMock('@angular/compiler-cli', () => ({
    NgtscProgram: class {},
    constructorParametersDownlevelTransform: vi.fn(() => vi.fn()),
    readConfiguration: vi.fn(() => ({
      options: {},
      rootNames: [`${workspaceRoot}/src/app/app.component.ts`],
    })),
  }));

  vi.doMock('./compiler-plugin.js', () => ({
    createCompilerPlugin: vi.fn(() => ({
      name: 'mock-compiler-plugin',
    })),
    createRolldownCompilerPlugin: vi.fn(() => ({
      name: 'mock-rolldown-compiler-plugin',
    })),
  }));

  vi.doMock('./host.js', () => ({
    augmentHostWithCaching: vi.fn(),
    augmentHostWithResources: vi.fn(),
    augmentProgramWithVersioning: vi.fn(),
    mergeTransformers: vi.fn(() => ({})),
  }));

  // Keep this spec scoped to the "Angular emitted nothing" guard. Pulling in
  // the real Analog compiler plugin would exercise the emitter stack instead
  // of the opt-out behavior this regression test is protecting.
  vi.doMock('./analog-compiler-plugin.js', () => ({
    analogCompilerPlugin: vi.fn(() => ({
      name: 'mock-analog-compiler-plugin',
    })),
  }));

  vi.doMock('./utils/devkit.js', () => ({
    JavaScriptTransformer: class {
      close = vi.fn();
      transformFile = vi.fn();
    },
    SourceFileCache: class {
      invalidate = vi.fn();
    },
    angularFullVersion: 200000,
    createAngularCompilation: vi.fn(),
    createJitResourceTransformer: vi.fn(() => vi.fn()),
  }));

  const { angular } = await import('./angular-vite-plugin');
  const plugin = angular({
    tsconfig: tsconfigPath,
    workspaceRoot,
    experimental: {
      useAngularCompilationAPI: false,
    },
  }).find((entry) => entry.name === '@analogjs/vite-plugin-angular') as any;

  await plugin.config?.(
    {
      mode: 'development',
      resolve: {},
      root: workspaceRoot,
    },
    { command: 'serve', mode: 'development' },
  );
  await plugin.configResolved?.({
    build: {},
    cacheDir: `${workspaceRoot}/node_modules/.vite/transform-spec`,
    mode: 'development',
    plugins: [],
    root: workspaceRoot,
    server: {},
  });
  await plugin.buildStart?.call({
    addWatchFile: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  });

  return { plugin, workspaceRoot };
}

describe('legacy Angular transform', () => {
  beforeEach(() => {
    process.env['NODE_ENV'] = 'test';
    process.env['VITEST'] = 'true';
  });

  afterEach(() => {
    vi.doUnmock('typescript');
    vi.doUnmock('@angular/compiler-cli');
    vi.doUnmock('./compiler-plugin.js');
    vi.doUnmock('./host.js');
    vi.doUnmock('./analog-compiler-plugin.js');
    vi.doUnmock('./utils/devkit.js');
    for (const workspaceRoot of temporaryWorkspaceRoots) {
      rmSync(workspaceRoot, { recursive: true, force: true });
    }
    temporaryWorkspaceRoots.clear();

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

  it('returns undefined when Angular did not emit the requested TS file', async () => {
    const { plugin, workspaceRoot } = await setupLegacyTransformPlugin();
    const transformHook = plugin.transform.handler;
    const id = `${workspaceRoot}/enterpriseOS/schema/src/gdm/identifiers.ts`;

    const result = await transformHook.call(
      {
        addWatchFile: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
      },
      'export const DvsEntityUuidSchema = {};',
      id,
    );

    // `undefined` is the safe opt-out signal here: Vite or another plugin can
    // keep handling the file instead of Analog inventing a transform result.
    expect(result).toBeUndefined();
  }, 15_000);
});
