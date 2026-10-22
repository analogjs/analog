// Mocked at module level so the plugin sees our stubs for the OXC/esbuild
// strip pass on the bypass path. Kept in a separate file from compile.spec.ts
// because that suite uses real `vite.transformWithOxc` for end-to-end checks.
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { readConfiguration } from '@angular/compiler-cli';
import { normalizePath } from 'vite';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

let mockRolldownVersion: string | undefined;
const mockTransformWithOxc = vi.fn();
const mockTransformWithEsbuild = vi.fn();
const mockPreprocessCSS = vi.fn();

vi.mock('vite', async () => {
  const actual = await vi.importActual<typeof import('vite')>('vite');
  return {
    ...actual,
    get rolldownVersion() {
      return mockRolldownVersion;
    },
    transformWithOxc: (...args: unknown[]) => mockTransformWithOxc(...args),
    transformWithEsbuild: (...args: unknown[]) =>
      mockTransformWithEsbuild(...args),
    preprocessCSS: (...args: unknown[]) => mockPreprocessCSS(...args),
  };
});

import { fastCompilePlugin, getPathsBasePath } from './fast-compile-plugin';

function buildPlugin() {
  return fastCompilePlugin({
    tsconfigGetter: () => 'tsconfig.json',
    workspaceRoot: '/workspace',
    inlineStylesExtension: 'css',
    jit: false,
    liveReload: false,
    isTest: false,
    isAstroIntegration: false,
  });
}

function getTransformHandler(plugin: ReturnType<typeof buildPlugin>) {
  const transform = plugin.transform as any;
  return transform.handler ?? transform;
}

describe('fastCompilePlugin bypass strips TS', () => {
  beforeEach(() => {
    mockRolldownVersion = undefined;
    vi.clearAllMocks();
    mockTransformWithOxc.mockResolvedValue({
      code: 'export { SomeClass } from "./lib/some-file";\n',
      map: { mappings: '' },
    });
    mockTransformWithEsbuild.mockResolvedValue({
      code: 'export { SomeClass } from "./lib/some-file";\n',
      map: { mappings: '' },
    });
  });

  it('runs OXC strip on barrel file with mixed value/type re-export (rolldown)', async () => {
    mockRolldownVersion = '1.0.0';
    const plugin = buildPlugin();
    const handler = getTransformHandler(plugin);

    const code = `export { SomeClass, type SomeInterface } from './lib/some-file';\n`;
    const result = await handler.call(
      { addWatchFile: () => undefined, resolve: async () => null },
      code,
      '/src/lib/barrel.ts',
    );

    expect(mockTransformWithOxc).toHaveBeenCalledWith(
      code,
      '/src/lib/barrel.ts',
      expect.objectContaining({ lang: 'ts', sourcemap: true }),
    );
    expect(result.code).toBe('export { SomeClass } from "./lib/some-file";\n');
  });

  it('runs esbuild strip on barrel file when transformWithOxc is unavailable', async () => {
    mockRolldownVersion = undefined;
    // Force the OXC branch to be skipped by making the function falsy.
    (
      mockTransformWithOxc as unknown as { mockImplementationOnce: any }
    ).mockImplementationOnce(undefined);
    const plugin = buildPlugin();
    const handler = getTransformHandler(plugin);

    // Temporarily remove OXC entry so the falsy branch is taken.
    const viteMod = await import('vite');
    const realOxc = viteMod.transformWithOxc;
    Object.defineProperty(viteMod, 'transformWithOxc', {
      value: undefined,
      configurable: true,
    });
    try {
      const code = `export { SomeClass, type SomeInterface } from './lib/some-file';\n`;
      const result = await handler.call(
        { addWatchFile: () => undefined, resolve: async () => null },
        code,
        '/src/lib/barrel.ts',
      );
      expect(mockTransformWithEsbuild).toHaveBeenCalledWith(
        code,
        '/src/lib/barrel.ts',
        expect.objectContaining({ loader: 'ts', sourcemap: true }),
      );
      expect(result.code).toBe(
        'export { SomeClass } from "./lib/some-file";\n',
      );
    } finally {
      Object.defineProperty(viteMod, 'transformWithOxc', {
        value: realOxc,
        configurable: true,
      });
    }
  });

  it('strips a plain TS file with no Angular decorator (router config)', async () => {
    const plugin = buildPlugin();
    const handler = getTransformHandler(plugin);

    const code = `import type { Route } from '@angular/router';\nexport const ROUTES: Route[] = [];\n`;
    await handler.call(
      { addWatchFile: () => undefined, resolve: async () => null },
      code,
      '/src/app/app.routes.ts',
    );

    expect(mockTransformWithOxc).toHaveBeenCalled();
  });

  it('strips TS-only syntax in the JIT path so `readonly` etc. never reach Rolldown', async () => {
    // Regression for analogjs/analog#2339: fastCompile's JIT path returned
    // the jitTransform output as-is, leaving TS-only modifiers like
    // `readonly` in place. On StackBlitz / WebContainer (and any other
    // environment without `angularVitestSourcemapPlugin`), Rolldown's parser
    // chokes on the unstripped TS:
    //   `Parse failure: Unexpected token \`ident\`. Expected * for generator, …`
    // The JIT path must self-strip so the output is valid JS regardless of
    // which downstream plugins are registered.
    mockRolldownVersion = '1.0.0';
    mockTransformWithOxc.mockResolvedValue({
      code: 'export class App { test = ""; }\n',
      map: { mappings: '' },
    });

    const plugin = fastCompilePlugin({
      tsconfigGetter: () => 'tsconfig.json',
      workspaceRoot: '/workspace',
      inlineStylesExtension: 'css',
      jit: true,
      liveReload: false,
      isTest: true,
      isAstroIntegration: false,
    });
    const handler = getTransformHandler(plugin);

    const code = `import { Component } from '@angular/core';
@Component({ selector: 'app-root', template: '<div></div>' })
export class App {
  readonly test = '';
}
`;
    const result = await handler.call(
      { addWatchFile: () => undefined, resolve: async () => null },
      code,
      '/src/app/app.ts',
    );

    // OXC strip must have been called with the jitTransform output (which
    // still contains `readonly`) so Rolldown receives valid JS. We also
    // pass the jitTransform map as `inMap` so OXC composes the strip map
    // with it, keeping debug positions accurate.
    const oxcStripCall = mockTransformWithOxc.mock.calls.find(
      ([, callId]) => callId === '/src/app/app.ts',
    );
    expect(oxcStripCall).toBeDefined();
    expect(oxcStripCall![0]).toContain('readonly');
    expect(oxcStripCall![2]).toMatchObject({ lang: 'ts', sourcemap: true });
    expect(oxcStripCall![3]).toBeDefined(); // inMap from jitTransform
    expect(result.code).not.toContain('readonly');
  });

  it('JIT path falls back to esbuild when transformWithOxc is unavailable', async () => {
    // Vite 6-8 compatibility: the same regression coverage as the OXC test
    // above, but exercising the esbuild branch the plugin takes when
    // `vite.transformWithOxc` is undefined (Vite 6 / pre-Rolldown).
    mockTransformWithEsbuild.mockResolvedValue({
      code: 'export class App { test = ""; }\n',
      map: { mappings: '' },
    });

    const viteMod = await import('vite');
    const realOxc = viteMod.transformWithOxc;
    Object.defineProperty(viteMod, 'transformWithOxc', {
      value: undefined,
      configurable: true,
    });
    try {
      const plugin = fastCompilePlugin({
        tsconfigGetter: () => 'tsconfig.json',
        workspaceRoot: '/workspace',
        inlineStylesExtension: 'css',
        jit: true,
        liveReload: false,
        isTest: true,
        isAstroIntegration: false,
      });
      const handler = getTransformHandler(plugin);

      const code = `import { Component } from '@angular/core';
@Component({ selector: 'app-root', template: '<div></div>' })
export class App {
  readonly test = '';
}
`;
      const result = await handler.call(
        { addWatchFile: () => undefined, resolve: async () => null },
        code,
        '/src/app/app.ts',
      );

      const esbuildStripCall = mockTransformWithEsbuild.mock.calls.find(
        ([, callId]) => callId === '/src/app/app.ts',
      );
      expect(esbuildStripCall).toBeDefined();
      expect(esbuildStripCall![0]).toContain('readonly');
      expect(esbuildStripCall![2]).toMatchObject({
        loader: 'ts',
        sourcemap: true,
      });
      expect(esbuildStripCall![3]).toBeDefined(); // inMap from jitTransform
      expect(result.code).not.toContain('readonly');
    } finally {
      Object.defineProperty(viteMod, 'transformWithOxc', {
        value: realOxc,
        configurable: true,
      });
    }
  });

  it('does not run the bypass strip when the file has @Component', async () => {
    const plugin = buildPlugin();
    const handler = getTransformHandler(plugin);

    // A component file goes through the full compile path, so the final strip
    // receives Angular's generated Ivy definitions rather than the raw input.
    const code = `
import { Component } from '@angular/core';
@Component({ selector: 'x', template: '' })
export class XComponent {}
`;
    try {
      await handler.call(
        { addWatchFile: () => undefined, resolve: async () => null },
        code,
        '/src/app/x.component.ts',
      );
    } catch {
      // The full compile path may throw under the mocked OXC return value;
      // we only care that the bypass branch was not taken.
    }

    const sawCompiledCall = mockTransformWithOxc.mock.calls.some(
      ([callCode]: any[]) => callCode.includes('ɵcmp'),
    );
    expect(sawCompiledCall).toBe(true);
  });

  it('composes the AOT compiler map with the TypeScript strip map', async () => {
    const plugin = buildPlugin();
    const handler = getTransformHandler(plugin);
    const code = `
import { Component } from '@angular/core';
@Component({ selector: 'x', template: '' })
export class XComponent {
  value: string = 'test';
}
`;

    const result = await handler.call(
      { addWatchFile: () => undefined, resolve: async () => null },
      code,
      '/src/app/x.component.ts',
    );
    const stripCall = mockTransformWithOxc.mock.calls.at(-1)!;

    expect(stripCall[2]).toMatchObject({ lang: 'ts', sourcemap: true });
    expect(stripCall[3]).toMatchObject({ mappings: expect.any(String) });
    expect(result.map).toEqual({ mappings: '' });
  });

  it('composes the AOT compiler map with the esbuild fallback map', async () => {
    const viteMod = await import('vite');
    const realOxc = viteMod.transformWithOxc;
    Object.defineProperty(viteMod, 'transformWithOxc', {
      value: undefined,
      configurable: true,
    });
    try {
      const plugin = buildPlugin();
      const handler = getTransformHandler(plugin);
      const code = `
import { Component } from '@angular/core';
@Component({ selector: 'x', template: '' })
export class XComponent {
  value: string = 'test';
}
`;

      const result = await handler.call(
        { addWatchFile: () => undefined, resolve: async () => null },
        code,
        '/src/app/x.component.ts',
      );
      const stripCall = mockTransformWithEsbuild.mock.calls.at(-1)!;

      expect(stripCall[2]).toMatchObject({ loader: 'ts', sourcemap: true });
      expect(stripCall[3]).toMatchObject({ mappings: expect.any(String) });
      expect(result.map).toEqual({ mappings: '' });
    } finally {
      Object.defineProperty(viteMod, 'transformWithOxc', {
        value: realOxc,
        configurable: true,
      });
    }
  });

  it('does not run the bypass strip when the file has only @Service', async () => {
    // Regression: Angular v22's `@Service` decorator must be detected as an
    // Angular file so it takes the full compile path (emitting ɵfac/ɵprov)
    // rather than the strip-only bypass. When skipped, the class is left
    // without Ivy defs and falls back to the JIT compiler at runtime.
    const plugin = buildPlugin();
    const handler = getTransformHandler(plugin);

    const code = `
import { Service, inject } from '@angular/core';
@Service({ autoProvided: false })
export class MyService {
  private dep = inject(Object);
}
`;
    try {
      await handler.call(
        { addWatchFile: () => undefined, resolve: async () => null },
        code,
        '/src/app/my.service.ts',
      );
    } catch {
      // The full compile path may throw under the mocked OXC return value;
      // we only care that the bypass branch was not taken.
    }

    const sawCompiledCall = mockTransformWithOxc.mock.calls.some(
      ([callCode]: any[]) => callCode.includes('ɵprov'),
    );
    expect(sawCompiledCall).toBe(true);
  });

  it('preprocesses an external .scss styleUrl by its own extension when inlineStylesExtension is css', async () => {
    // Regression: external `.scss` styleUrls must be run through the Sass
    // preprocessor based on their own file extension — even with the default
    // `inlineStylesExtension: 'css'`. Without this the inlined SCSS is scoped
    // but never compiled, so nested rules / `&` silently fail to apply.
    mockPreprocessCSS.mockResolvedValue({ code: ':host{}\n' });
    mockTransformWithOxc.mockResolvedValue({ code: '', map: { mappings: '' } });

    const plugin = buildPlugin(); // inlineStylesExtension: 'css'
    const handler = getTransformHandler(plugin);

    const id = `${__dirname}/compiler/__fixtures__/ext.component.ts`;
    const code = `
import { Component } from '@angular/core';
@Component({ selector: 'app-ext', template: '', styleUrl: './test.component.scss' })
export class ExtComponent {}
`;
    try {
      await handler.call(
        { addWatchFile: () => undefined, resolve: async () => null },
        code,
        id,
      );
    } catch {
      // The full compile path may throw under the mocked transforms; we only
      // assert the external scss was sent to the preprocessor as `.scss`.
    }

    const scssCall = mockPreprocessCSS.mock.calls.find(
      ([, fakePath]: any[]) =>
        typeof fakePath === 'string' && fakePath.endsWith('.scss'),
    );
    expect(scssCall).toBeDefined();
  });
});

describe('fastCompilePlugin transform filter', () => {
  it('skips modules rejected by an analog.setup transform filter', async () => {
    vi.clearAllMocks();
    const plugin = buildPlugin();
    await (plugin.configResolved as any)({
      plugins: [
        {
          name: 'components-only',
          analog: {
            setup(ctx: any) {
              ctx.registerTransformFilter((_code: string, id: string) =>
                id.includes('src/components'),
              );
            },
          },
        },
      ],
    });
    const handler = getTransformHandler(plugin);

    const result = await handler.call(
      { addWatchFile: () => undefined, resolve: async () => null },
      'export const routes = [];\n',
      '/src/app/routes.ts',
    );

    expect(result).toBeUndefined();
    expect(mockTransformWithOxc).not.toHaveBeenCalled();
    expect(mockTransformWithEsbuild).not.toHaveBeenCalled();
  });

  it('excludes .ts?raw ids so Vite raw handling stands (#2356)', () => {
    const plugin = buildPlugin();
    const exclude = (plugin.transform as any).filter.id.exclude as unknown[];
    const matchesExclude = (id: string) =>
      exclude.some((re) => re instanceof RegExp && re.test(id));

    expect(matchesExclude('/src/app/foo.ts?raw')).toBe(true);
    expect(matchesExclude('/src/app/foo.cts?raw')).toBe(true);
    expect(matchesExclude('/src/app/foo.mts?raw')).toBe(true);
    expect(matchesExclude('/src/app/foo.ts?import&raw')).toBe(true);

    expect(matchesExclude('/src/app/foo.ts')).toBe(false);
    expect(matchesExclude('/src/app/foo.ts?t=12345')).toBe(false);
    expect(matchesExclude('/src/app/foo.ts?component')).toBe(false);
  });
});

describe('getPathsBasePath', () => {
  let workspaceRoot: string;

  beforeEach(() => {
    workspaceRoot = mkdtempSync(join(tmpdir(), 'analog-paths-base-'));
  });

  afterEach(() => {
    rmSync(workspaceRoot, { recursive: true, force: true });
  });

  function writeConfigs(
    root: Record<string, unknown>,
    app: Record<string, unknown>,
  ) {
    mkdirSync(join(workspaceRoot, 'apps', 'demo'), { recursive: true });
    writeFileSync(
      join(workspaceRoot, 'tsconfig.base.json'),
      JSON.stringify(root),
    );
    const appConfig = join(workspaceRoot, 'apps', 'demo', 'tsconfig.json');
    writeFileSync(
      appConfig,
      JSON.stringify({ extends: '../../tsconfig.base.json', ...app }),
    );
    return appConfig;
  }

  it('anchors inherited paths on the config that declares them when baseUrl is unset', () => {
    const appConfig = writeConfigs(
      { compilerOptions: { paths: { lib: ['./libs/lib/src/index.ts'] } } },
      { files: [] },
    );

    const { options } = readConfiguration(appConfig);

    expect(getPathsBasePath(options, dirname(appConfig))).toBe(workspaceRoot);
  });

  it('prefers an explicit baseUrl over the declaring config directory', () => {
    const appConfig = writeConfigs(
      { compilerOptions: { paths: { lib: ['./libs/lib/src/index.ts'] } } },
      { compilerOptions: { baseUrl: './src' }, files: [] },
    );

    const { options } = readConfiguration(appConfig);

    expect(getPathsBasePath(options, dirname(appConfig))).toBe(
      join(workspaceRoot, 'apps', 'demo', 'src'),
    );
  });

  it('falls back to the project root when no config anchors paths', () => {
    expect(getPathsBasePath(undefined, '/project')).toBe('/project');
  });
});

describe('fastCompilePlugin on-demand registry', () => {
  let root: string;

  const write = (name: string, code: string) => {
    const file = join(root, name);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, code);
    return normalizePath(file);
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockTransformWithOxc.mockImplementation(async (code: string) => ({
      code,
      map: { mappings: '' },
    }));
    root = mkdtempSync(join(tmpdir(), 'analog-lazy-registry-'));
    write('tsconfig.json', JSON.stringify({ files: [] }));
    write(
      'child.ts',
      `import { Component } from '@angular/core';
@Component({ selector: 'app-a', template: '' })
export class ChildA {}
@Component({ selector: 'app-b', template: '' })
export class ChildB {}
export const ChildImports = [ChildA, ChildB] as const;
`,
    );
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  async function setup(aliases: Record<string, string> = {}) {
    const plugin = fastCompilePlugin({
      tsconfigGetter: () => join(root, 'tsconfig.json'),
      workspaceRoot: root,
      inlineStylesExtension: 'css',
      jit: false,
      liveReload: false,
      isTest: false,
      isAstroIntegration: false,
    });
    await (plugin.config as any)({ root }, { command: 'serve' });
    await (plugin.buildStart as any)();
    const resolve = async (spec: string) => {
      const file = spec.startsWith('.')
        ? join(root, `${spec}.ts`)
        : aliases[spec] && join(root, aliases[spec]);
      return file ? { id: normalizePath(file) } : null;
    };
    const parentId = normalizePath(join(root, 'parent.ts'));
    const compileParent = async (imports: string, from: string) =>
      (
        await getTransformHandler(plugin).call(
          { resolve },
          `import { Component } from '@angular/core';
import { ${imports} } from '${from}';
@Component({ selector: 'app-parent', imports: [${imports}], template: '' })
export class Parent {}
`,
          parentId,
        )
      ).code as string;
    const hotUpdate = (file: string, modules: unknown[]) =>
      (plugin.handleHotUpdate as any)({
        file,
        modules,
        server: {
          moduleGraph: {
            getModuleById: () => undefined,
            getModulesByFile: (f: string) =>
              f === parentId ? new Set([{ id: parentId }]) : undefined,
          },
        },
      });
    return { compileParent, hotUpdate, parentId };
  }

  it('resolves imported declarations without a project scan', async () => {
    const { compileParent } = await setup();

    expect(await compileParent('ChildImports', './child')).toContain(
      'dependencies: () => [ChildA, ChildB, Parent]',
    );
  });

  it('follows re-exports through path aliases', async () => {
    write('barrel.ts', `export { LibImports } from '@lib/lib';\n`);
    write(
      'lib/lib.ts',
      `import { Directive } from '@angular/core';
@Directive({ selector: '[libA]' })
export class LibA {}
export const LibImports = [LibA] as const;
`,
    );
    const { compileParent } = await setup({ '@lib/lib': 'lib/lib.ts' });

    expect(await compileParent('LibImports', './barrel')).toContain(
      'dependencies: () => [LibA, Parent]',
    );
  });

  it('registers package declarations imported by a scanned NgModule', async () => {
    write(
      'node_modules/fake-lib/package.json',
      JSON.stringify({ name: 'fake-lib', types: 'index.d.ts' }),
    );
    write(
      'node_modules/fake-lib/index.d.ts',
      `import * as i0 from '@angular/core';
export declare class FakeDir {
  static ɵdir: i0.ɵɵDirectiveDeclaration<FakeDir, "[fake]", never, {}, {}, never, never, true, never>;
}
`,
    );
    write(
      'shared.ts',
      `import { NgModule } from '@angular/core';
import { FakeDir } from 'fake-lib';
@NgModule({ imports: [FakeDir], exports: [FakeDir] })
export class SharedModule {}
`,
    );
    const { compileParent } = await setup();

    expect(await compileParent('SharedModule', './shared')).toMatch(
      /dependencies: \(\) => \[[^\]]*FakeDir/,
    );
  });

  it('rescans barrels after a file they re-export changes', async () => {
    write('barrel.ts', `export * from './child';\n`);
    const { compileParent, hotUpdate } = await setup();
    await compileParent('ChildImports', './barrel');

    write(
      'extra.ts',
      `import { Component } from '@angular/core';
@Component({ selector: 'app-c', template: '' })
export class ChildC {}
export const ExtraImports = [ChildC] as const;
`,
    );
    const childId = write(
      'child.ts',
      readFileSync(join(root, 'child.ts'), 'utf-8')
        .replace(
          "from '@angular/core';",
          "from '@angular/core';\nimport { ExtraImports } from './extra';",
        )
        .replace('[ChildA, ChildB]', '[ChildA, ChildB, ExtraImports]'),
    );
    await hotUpdate(childId, []);

    expect(await compileParent('ChildImports', './barrel')).toContain(
      'dependencies: () => [ChildA, ChildB, ChildC, Parent]',
    );
  });

  it('recompiles importers when an imported selector changes', async () => {
    const { compileParent, hotUpdate, parentId } = await setup();
    await compileParent('ChildImports', './child');
    const childId = normalizePath(join(root, 'child.ts'));
    const childModule = { id: childId };

    expect(await hotUpdate(childId, [childModule])).toEqual([childModule]);

    write(
      'child.ts',
      readFileSync(childId, 'utf-8').replace('app-a', 'app-renamed'),
    );
    expect(await hotUpdate(childId, [childModule])).toEqual([
      childModule,
      { id: parentId },
    ]);
  });
});
