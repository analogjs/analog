// Separate file from angular-vitest-plugin.spec.ts because those tests use
// real Vite functions (resolveConfig / defineConfig) which break under a
// module-level vi.mock('vite').
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

import {
  angularVitestPlugin,
  angularVitestEsbuildPlugin,
  angularVitestSourcemapPlugin,
} from './angular-vitest-plugin';

describe('OXC conditional paths', () => {
  beforeEach(() => {
    mockRolldownVersion = undefined;
    vi.clearAllMocks();
    mockTransformWithOxc.mockResolvedValue({ code: 'oxc-out', map: {} });
    mockTransformWithEsbuild.mockResolvedValue({
      code: 'esbuild-out',
      map: {},
    });
  });

  describe('angularVitestPlugin transform', () => {
    it('calls transformWithOxc for fesm2022 files with async when rolldownVersion is set', async () => {
      mockRolldownVersion = '1.0.0';
      const plugin = angularVitestPlugin();
      const result = await (plugin.transform as any)(
        'async function foo() {}',
        '/node_modules/@angular/core/fesm2022/core.mjs',
      );

      expect(mockTransformWithOxc).toHaveBeenCalledWith(
        'async function foo() {}',
        '/node_modules/@angular/core/fesm2022/core.mjs',
        expect.objectContaining({
          lang: 'js',
          target: 'es2016',
          sourcemap: true,
        }),
      );
      expect(mockTransformWithEsbuild).not.toHaveBeenCalled();
      expect(result.code).toBe('oxc-out');
      expect(result.map).toEqual({});
    });

    it('calls transformWithEsbuild for fesm2022 files with async when rolldownVersion is not set', async () => {
      mockRolldownVersion = undefined;
      const plugin = angularVitestPlugin();
      const id = '/node_modules/@angular/core/fesm2022/core.mjs';
      const result = await (plugin.transform as any)(
        'async function foo() {}',
        id,
      );

      expect(mockTransformWithEsbuild).toHaveBeenCalledWith(
        'async function foo() {}',
        id,
        expect.objectContaining({
          loader: 'js',
          format: 'esm',
          target: 'es2016',
          sourcemap: true,
          sourcefile: id,
        }),
      );
      expect(mockTransformWithOxc).not.toHaveBeenCalled();
      expect(result.code).toBe('esbuild-out');
    });

    it('transforms files containing @angular/cdk via OXC', async () => {
      mockRolldownVersion = '1.0.0';
      const plugin = angularVitestPlugin();
      const result = await (plugin.transform as any)(
        'import "@angular/cdk";',
        '/src/app/dialog.ts',
      );

      expect(mockTransformWithOxc).toHaveBeenCalled();
      expect(mockTransformWithEsbuild).not.toHaveBeenCalled();
      expect(result.code).toBe('oxc-out');
    });

    it('transforms files containing @angular/cdk via esbuild', async () => {
      mockRolldownVersion = undefined;
      const plugin = angularVitestPlugin();
      const result = await (plugin.transform as any)(
        'import "@angular/cdk";',
        '/src/app/dialog.ts',
      );

      expect(mockTransformWithEsbuild).toHaveBeenCalled();
      expect(mockTransformWithOxc).not.toHaveBeenCalled();
      expect(result.code).toBe('esbuild-out');
    });

    it('skips fesm2022 files without async keyword', async () => {
      const plugin = angularVitestPlugin();
      const result = await (plugin.transform as any)(
        'function foo() {}',
        '/node_modules/@angular/core/fesm2022/core.mjs',
      );

      expect(result).toBeUndefined();
      expect(mockTransformWithOxc).not.toHaveBeenCalled();
      expect(mockTransformWithEsbuild).not.toHaveBeenCalled();
    });

    it('skips non-matching files', async () => {
      const plugin = angularVitestPlugin();
      const result = await (plugin.transform as any)(
        'const x = 1;',
        '/src/app/app.component.ts',
      );

      expect(result).toBeUndefined();
    });
  });

  describe('angularVitestEsbuildPlugin config', () => {
    it('returns oxc config when rolldownVersion is set', () => {
      mockRolldownVersion = '1.0.0';
      const plugin = angularVitestEsbuildPlugin();
      const result = (plugin.config as any)({});

      expect(result).toHaveProperty('oxc', false);
      expect(result).not.toHaveProperty('esbuild');
    });

    it('returns esbuild config when rolldownVersion is not set', () => {
      mockRolldownVersion = undefined;
      const plugin = angularVitestEsbuildPlugin();
      const result = (plugin.config as any)({});

      expect(result).toHaveProperty('esbuild', false);
      expect(result).not.toHaveProperty('oxc');
    });

    it('preserves user-provided oxc config when rolldownVersion is set', () => {
      mockRolldownVersion = '1.0.0';
      const plugin = angularVitestEsbuildPlugin();
      const result = (plugin.config as any)({ oxc: { target: 'es2020' } });

      expect(result).toHaveProperty('oxc', { target: 'es2020' });
    });

    it('preserves user-provided esbuild config when rolldownVersion is not set', () => {
      mockRolldownVersion = undefined;
      const plugin = angularVitestEsbuildPlugin();
      const result = (plugin.config as any)({
        esbuild: { target: 'es2020' },
      });

      expect(result).toHaveProperty('esbuild', { target: 'es2020' });
    });
  });

  describe('angularVitestSourcemapPlugin transform', () => {
    it('calls transformWithOxc for .ts files when rolldownVersion is set', async () => {
      mockRolldownVersion = '1.0.0';
      const plugin = angularVitestSourcemapPlugin();
      await (plugin.transform as any)('const x = 1;', '/src/app/app.ts');

      expect(mockTransformWithOxc).toHaveBeenCalledWith(
        'const x = 1;',
        '/src/app/app.ts',
        expect.objectContaining({ lang: 'js' }),
      );
      expect(mockTransformWithEsbuild).not.toHaveBeenCalled();
    });

    it('calls transformWithEsbuild for .ts files when rolldownVersion is not set', async () => {
      mockRolldownVersion = undefined;
      const plugin = angularVitestSourcemapPlugin();
      await (plugin.transform as any)('const x = 1;', '/src/app/app.ts');

      expect(mockTransformWithEsbuild).toHaveBeenCalledWith(
        'const x = 1;',
        '/src/app/app.ts',
        expect.objectContaining({ loader: 'js' }),
      );
      expect(mockTransformWithOxc).not.toHaveBeenCalled();
    });

    it('skips non-.ts files', async () => {
      const plugin = angularVitestSourcemapPlugin();
      const result = await (plugin.transform as any)(
        'const x = 1;',
        '/src/app/util.js',
      );

      expect(result).toBeUndefined();
      expect(mockTransformWithOxc).not.toHaveBeenCalled();
      expect(mockTransformWithEsbuild).not.toHaveBeenCalled();
    });

    it('skips .ts files with ?inline query', async () => {
      const plugin = angularVitestSourcemapPlugin();
      const result = await (plugin.transform as any)(
        'const x = 1;',
        '/src/app/styles.ts?inline',
      );

      expect(result).toBeUndefined();
    });

    // NOTE: The source regex /\.ts/ also matches .tsx, .d.ts, etc.
    // If this is unintentional, the regex should be /\.ts$/ or /\.tsx?$/.
    it('transforms .tsx files (regex /\\.ts/ matches .tsx substring)', async () => {
      mockRolldownVersion = '1.0.0';
      const plugin = angularVitestSourcemapPlugin();
      await (plugin.transform as any)('const x = 1;', '/src/app/component.tsx');

      expect(mockTransformWithOxc).toHaveBeenCalled();
    });

    it('transforms .ts files with non-inline query', async () => {
      mockRolldownVersion = '1.0.0';
      const plugin = angularVitestSourcemapPlugin();
      await (plugin.transform as any)('const x = 1;', '/src/app/app.ts?raw');

      expect(mockTransformWithOxc).toHaveBeenCalled();
    });
  });
});
