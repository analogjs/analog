import { describe, it, expect, vi } from 'vitest';
import {
  angular,
  createFsWatcherCacheInvalidator,
  mapTemplateUpdatesToFiles,
  toAngularCompilationFileReplacements,
  isTestWatchMode,
} from './angular-vite-plugin';

describe('angularVitePlugin', () => {
  it('should work', () => {
    expect(angular()[0].name).toEqual('@analogjs/vite-plugin-angular');
  });
});

describe('isTestWatchMode', () => {
  it('should return false for vitest --run', () => {
    const result = isTestWatchMode(['--run']);

    expect(result).toBeFalsy();
  });

  it('should return true for vitest --no-run', () => {
    const result = isTestWatchMode(['--no-run']);

    expect(result).toBeTruthy();
  });

  it('should return true for vitest --watch', () => {
    const result = isTestWatchMode(['--watch']);

    expect(result).toBeTruthy();
  });

  it('should return true for vitest watch', () => {
    const result = isTestWatchMode(['watch']);

    expect(result).toBeTruthy();
  });

  it('should return false for vitest --no-watch', () => {
    const result = isTestWatchMode(['--no-watch']);

    expect(result).toBeFalsy();
  });

  it('should return false for vitest --watch=false', () => {
    const result = isTestWatchMode(['--watch=false']);

    expect(result).toBeFalsy();
  });

  it('should return false for vitest --watch false', () => {
    const result = isTestWatchMode(['--watch', 'false']);

    expect(result).toBeFalsy();
  });
});

describe('JIT resolveId', () => {
  it('should resolve style files with ?inline&analog=1 suffix', () => {
    const plugins = angular({ jit: true });
    const mainPlugin = plugins.find(
      (p) => p.name === '@analogjs/vite-plugin-angular',
    );
    expect(mainPlugin).toBeDefined();

    const resolveId = (mainPlugin as any).resolveId;
    expect(resolveId).toBeDefined();

    const result = resolveId(
      'angular:jit:style:file;./my-component.scss',
      '/project/src/app/my-component.ts',
    );

    expect(result).toBeDefined();
    expect(result).toContain('?inline&analog=1');
    expect(result).not.toContain('??inline');
  });

  it('should resolve template files with ?analog-raw suffix', () => {
    const plugins = angular({ jit: true });
    const mainPlugin = plugins.find(
      (p) => p.name === '@analogjs/vite-plugin-angular',
    );
    expect(mainPlugin).toBeDefined();

    const resolveId = (mainPlugin as any).resolveId;
    expect(resolveId).toBeDefined();

    const result = resolveId(
      'angular:jit:template:file;./my-component.html',
      '/project/src/app/my-component.ts',
    );

    expect(result).toBeDefined();
    expect(result).toContain('?analog-raw');
    expect(result).not.toContain('??analog-raw');
  });

  it('should intercept .html?raw imports and remap to ?analog-raw', () => {
    const plugins = angular({ jit: true });
    const mainPlugin = plugins.find(
      (p) => p.name === '@analogjs/vite-plugin-angular',
    );

    const resolveId = (mainPlugin as any).resolveId;

    // Relative path with importer
    const result = resolveId(
      './my-component.html?raw',
      '/project/src/app/my-component.ts',
    );
    expect(result).toContain('/project/src/app/my-component.html?analog-raw');

    // Absolute path
    const result2 = resolveId(
      '/project/src/app/my-component.html?raw',
      '/project/src/app/other.ts',
    );
    expect(result2).toBe('/project/src/app/my-component.html?analog-raw');
  });

  it('should intercept .html?raw imports even without jit mode', () => {
    const plugins = angular();
    const mainPlugin = plugins.find(
      (p) => p.name === '@analogjs/vite-plugin-angular',
    );

    const resolveId = (mainPlugin as any).resolveId;

    const result = resolveId(
      './my-component.html?raw',
      '/project/src/app/my-component.ts',
    );
    expect(result).toContain('?analog-raw');
  });

  it('should intercept style ?inline imports and remap to ?inline&analog=1', () => {
    const plugins = angular({ jit: true });
    const mainPlugin = plugins.find(
      (p) => p.name === '@analogjs/vite-plugin-angular',
    );

    const resolveId = (mainPlugin as any).resolveId;

    // Relative .scss?inline
    const result = resolveId(
      './my-component.scss?inline',
      '/project/src/app/my-component.ts',
    );
    expect(result).toBe('/project/src/app/my-component.scss?inline&analog=1');

    // Absolute .css?inline
    const result2 = resolveId(
      '/project/src/app/my-component.css?inline',
      '/project/src/app/other.ts',
    );
    expect(result2).toBe('/project/src/app/my-component.css?inline&analog=1');
  });

  it('should intercept style ?inline imports even without jit mode', () => {
    const plugins = angular();
    const mainPlugin = plugins.find(
      (p) => p.name === '@analogjs/vite-plugin-angular',
    );

    const resolveId = (mainPlugin as any).resolveId;

    const result = resolveId(
      './my-component.scss?inline',
      '/project/src/app/my-component.ts',
    );
    expect(result).toContain('?inline&analog=1');
  });
});

describe('createFsWatcherCacheInvalidator', () => {
  it('clears fs and tsconfig caches before recompiling', async () => {
    const invalidateFsCaches = vi.fn();
    const invalidateTsconfigCaches = vi.fn();
    const performCompilation = vi.fn().mockResolvedValue(undefined);
    const invalidate = createFsWatcherCacheInvalidator(
      invalidateFsCaches,
      invalidateTsconfigCaches,
      performCompilation,
    );

    await invalidate();

    expect(invalidateFsCaches).toHaveBeenCalledOnce();
    expect(invalidateTsconfigCaches).toHaveBeenCalledOnce();
    expect(performCompilation).toHaveBeenCalledOnce();
  });
});

describe('toAngularCompilationFileReplacements', () => {
  it('maps browser file replacements for the Angular compilation host', () => {
    expect(
      toAngularCompilationFileReplacements(
        [
          {
            replace: 'apps/demo/src/environments/environment.ts',
            with: 'apps/demo/src/environments/environment.prod.ts',
          },
          {
            replace: 'apps/demo/src/ssr-only.ts',
            ssr: 'apps/demo/src/ssr-only.server.ts',
          },
        ],
        '/workspace',
      ),
    ).toEqual({
      '/workspace/apps/demo/src/environments/environment.ts':
        '/workspace/apps/demo/src/environments/environment.prod.ts',
    });
  });

  it('returns undefined when no replacements are provided', () => {
    expect(
      toAngularCompilationFileReplacements([], '/workspace'),
    ).toBeUndefined();
  });

  it('returns undefined when all replacements are SSR-only', () => {
    expect(
      toAngularCompilationFileReplacements(
        [
          { replace: 'src/a.ts', ssr: 'src/a.server.ts' },
          { replace: 'src/b.ts', ssr: 'src/b.server.ts' },
        ],
        '/workspace',
      ),
    ).toBeUndefined();
  });

  it('passes through absolute paths without resolving against workspace root', () => {
    expect(
      toAngularCompilationFileReplacements(
        [
          {
            replace: '/absolute/src/env.ts',
            with: '/absolute/src/env.prod.ts',
          },
        ],
        '/workspace',
      ),
    ).toEqual({
      '/absolute/src/env.ts': '/absolute/src/env.prod.ts',
    });
  });

  it('handles a mix of absolute and relative paths', () => {
    expect(
      toAngularCompilationFileReplacements(
        [
          {
            replace: '/absolute/env.ts',
            with: 'relative/env.prod.ts',
          },
        ],
        '/workspace',
      ),
    ).toEqual({
      '/absolute/env.ts': '/workspace/relative/env.prod.ts',
    });
  });
});

describe('mapTemplateUpdatesToFiles', () => {
  it('maps Angular template update ids back to source files', () => {
    const updates = mapTemplateUpdatesToFiles(
      new Map([
        [
          encodeURIComponent(
            'apps/demo/src/app/demo.component.ts@DemoComponent',
          ),
          'export const hmr = true;',
        ],
      ]),
    );

    expect(
      updates.get(`${process.cwd()}/apps/demo/src/app/demo.component.ts`),
    ).toEqual({
      className: 'DemoComponent',
      code: 'export const hmr = true;',
    });
  });

  it('returns an empty map when input is undefined', () => {
    const updates = mapTemplateUpdatesToFiles(undefined);
    expect(updates.size).toBe(0);
  });

  it('returns an empty map when input is empty', () => {
    const updates = mapTemplateUpdatesToFiles(new Map());
    expect(updates.size).toBe(0);
  });

  it('defaults className to empty string when id has no @ separator', () => {
    const updates = mapTemplateUpdatesToFiles(
      new Map([
        [
          encodeURIComponent('apps/demo/src/app/orphan.component.ts'),
          'export const hmr = true;',
        ],
      ]),
    );

    const entry = [...updates.values()][0];
    expect(entry.className).toBe('');
    expect(entry.code).toBe('export const hmr = true;');
  });

  it('maps multiple updates across different files', () => {
    const updates = mapTemplateUpdatesToFiles(
      new Map([
        [
          encodeURIComponent('src/app/foo.component.ts@FooComponent'),
          'const foo = 1;',
        ],
        [
          encodeURIComponent('src/app/bar.component.ts@BarComponent'),
          'const bar = 2;',
        ],
      ]),
    );

    expect(updates.size).toBe(2);
    expect([...updates.values()].map((v) => v.className).sort()).toEqual([
      'BarComponent',
      'FooComponent',
    ]);
  });
});
