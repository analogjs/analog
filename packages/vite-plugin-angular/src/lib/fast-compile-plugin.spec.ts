// Mocked at module level so the plugin sees our stubs for the OXC/esbuild
// strip pass on the bypass path. Kept in a separate file from compile.spec.ts
// because that suite uses real `vite.transformWithOxc` for end-to-end checks.
import { describe, it, expect, vi, beforeEach } from 'vitest';

let mockRolldownVersion: string | undefined;
const mockTransformWithOxc = vi.fn();
const mockTransformWithEsbuild = vi.fn();

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
  };
});

import { fastCompilePlugin } from './fast-compile-plugin';

function buildPlugin() {
  return fastCompilePlugin({
    tsconfigGetter: () => 'tsconfig.json',
    workspaceRoot: '/workspace',
    inlineStylesExtension: 'css',
    jit: false,
    liveReload: false,
    supportedBrowsers: [],
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
      { addWatchFile: () => undefined },
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
        { addWatchFile: () => undefined },
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
      { addWatchFile: () => undefined },
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
      supportedBrowsers: [],
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
      { addWatchFile: () => undefined },
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
        supportedBrowsers: [],
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
        { addWatchFile: () => undefined },
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

    // A component file goes through the full compile path which calls
    // transformWithOxc internally too, but with `sourcemap: false`. The
    // bypass uses `sourcemap: true` — assert no `sourcemap: true` call to
    // confirm we did not enter the bypass branch.
    const code = `
import { Component } from '@angular/core';
@Component({ selector: 'x', template: '' })
export class XComponent {}
`;
    try {
      await handler.call(
        { addWatchFile: () => undefined },
        code,
        '/src/app/x.component.ts',
      );
    } catch {
      // The full compile path may throw under the mocked OXC return value;
      // we only care that the bypass branch was not taken.
    }

    const sawBypassCall = mockTransformWithOxc.mock.calls.some(
      ([, , opts]: any[]) => opts?.sourcemap === true,
    );
    expect(sawBypassCall).toBe(false);
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
        { addWatchFile: () => undefined },
        code,
        '/src/app/my.service.ts',
      );
    } catch {
      // The full compile path may throw under the mocked OXC return value;
      // we only care that the bypass branch was not taken.
    }

    const sawBypassCall = mockTransformWithOxc.mock.calls.some(
      ([, , opts]: any[]) => opts?.sourcemap === true,
    );
    expect(sawBypassCall).toBe(false);
  });
});

describe('fastCompilePlugin transform filter', () => {
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
