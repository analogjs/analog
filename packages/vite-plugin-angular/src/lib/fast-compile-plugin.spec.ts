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
});
