import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Plugin } from 'vite';
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

describe('hmr option', () => {
  it('disables HMR helper plugins when hmr is false', () => {
    const plugins = angular({ hmr: false });
    const names = plugins.map((plugin) => plugin.name);

    expect(names).not.toContain(
      '@analogjs/vite-plugin-angular:hmr-vite-ignore',
    );
    expect(names).not.toContain('analogjs-live-reload-plugin');
  });

  it('accepts liveReload as a compatibility alias', () => {
    const plugins = angular({ liveReload: true });
    const names = plugins.map((plugin) => plugin.name);

    expect(names).toContain('@analogjs/vitest-angular-esm-plugin');
  });

  it('prefers hmr over liveReload when both are provided', () => {
    const plugins = angular({ hmr: false, liveReload: true });
    const names = plugins.map((plugin) => plugin.name);

    expect(names).not.toContain(
      '@analogjs/vite-plugin-angular:hmr-vite-ignore',
    );
    expect(names).not.toContain('analogjs-live-reload-plugin');
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
  it('should resolve style files with ?inline suffix (single ?)', () => {
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
    expect(result).toContain('?inline');
    expect(result).not.toContain('??inline');
  });

  it('should resolve template files with ?raw suffix (single ?)', () => {
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
    expect(result).toContain('?raw');
    expect(result).not.toContain('??raw');
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

// =============================================================================
// Tailwind CSS @reference injection
//
// Regression tests for the tailwind-reference Vite plugin and the
// buildStylePreprocessor function that together ensure Angular component CSS
// files receive `@reference` directives pointing to the root Tailwind
// stylesheet. Without @reference, @tailwindcss/vite processes each component
// CSS in isolation and can't resolve prefixed utilities like `sa:flex`.
//
// Background:
//   - Angular component CSS (e.g. card.component.css) uses `@apply sa:flex`
//   - Tailwind v4 needs `@import 'tailwindcss' prefix(sa)` or `@reference`
//     to a file that has it, otherwise it treats `sa:` as an unknown variant
//   - The `buildStylePreprocessor` injects @reference during Angular
//     compilation (before Vite transforms)
//   - The `tailwind-reference` plugin (enforce:"pre") acts as a Vite
//     transform-level safety net
// =============================================================================

describe('tailwind-reference plugin', () => {
  const ROOT_CSS = '/project/src/styles/tailwind.css';

  /**
   * Helper: extract the tailwind-reference sub-plugin from the array
   * returned by angular(). Returns undefined if tailwindCss is not configured.
   */
  function getTailwindReferencePlugin(
    options?: Parameters<typeof angular>[0],
  ): Plugin | undefined {
    const plugins = angular(options);
    return plugins.find(
      (p) => p.name === '@analogjs/vite-plugin-angular:tailwind-reference',
    );
  }

  /**
   * Helper: call the plugin's transform hook with the given CSS code and id.
   * Returns the transformed output (string or undefined if skipped).
   */
  function callTransform(
    plugin: Plugin,
    code: string,
    id: string,
  ): string | undefined {
    const transform =
      typeof plugin.transform === 'function'
        ? plugin.transform
        : (plugin.transform as any)?.handler;
    // The transform is synchronous in this plugin
    return transform?.call({} as any, code, id) as string | undefined;
  }

  // ---------------------------------------------------------------------------
  // Plugin creation
  // ---------------------------------------------------------------------------

  it('is included when tailwindCss option is provided', () => {
    const plugin = getTailwindReferencePlugin({
      tailwindCss: { rootStylesheet: ROOT_CSS },
    });
    expect(plugin).toBeDefined();
    expect(plugin!.enforce).toBe('pre');
  });

  it('is NOT included when tailwindCss option is omitted', () => {
    const plugin = getTailwindReferencePlugin();
    expect(plugin).toBeUndefined();
  });

  it('is NOT included when tailwindCss option is undefined', () => {
    const plugin = getTailwindReferencePlugin({ tailwindCss: undefined });
    expect(plugin).toBeUndefined();
  });

  // ---------------------------------------------------------------------------
  // @reference injection via transform
  // ---------------------------------------------------------------------------

  describe('transform', () => {
    let plugin: Plugin;

    beforeEach(() => {
      plugin = getTailwindReferencePlugin({
        tailwindCss: { rootStylesheet: ROOT_CSS, prefixes: ['sa:'] },
      })!;
    });

    it('injects @reference into component CSS that uses the configured prefix', () => {
      const css = '.demo { @apply sa:flex sa:gap-4; }';
      const result = callTransform(
        plugin,
        css,
        '/project/src/app/demo.component.css',
      );
      expect(result).toBe(`@reference "${ROOT_CSS}";\n${css}`);
    });

    it('injects @reference for CSS served with ?direct&ngcomp query params', () => {
      // Angular externalizes component CSS with these query params
      const css = ':host { @apply sa:grid; }';
      const result = callTransform(
        plugin,
        css,
        '/project/src/app/card.component.css?direct&ngcomp=ng-c123&e=0',
      );
      expect(result).toBe(`@reference "${ROOT_CSS}";\n${css}`);
    });

    it('skips non-CSS files', () => {
      const result = callTransform(
        plugin,
        'import { Component } from "@angular/core";',
        '/project/src/app/app.component.ts',
      );
      expect(result).toBeUndefined();
    });

    it('skips the root stylesheet itself', () => {
      const result = callTransform(
        plugin,
        '@import "tailwindcss" prefix(sa);',
        ROOT_CSS,
      );
      expect(result).toBeUndefined();
    });

    it('skips the root stylesheet even with query params', () => {
      const result = callTransform(
        plugin,
        '@import "tailwindcss" prefix(sa);',
        `${ROOT_CSS}?direct`,
      );
      expect(result).toBeUndefined();
    });

    it('skips CSS that already has @reference', () => {
      const css = `@reference "${ROOT_CSS}";\n.demo { @apply sa:flex; }`;
      const result = callTransform(
        plugin,
        css,
        '/project/src/app/demo.component.css',
      );
      expect(result).toBeUndefined();
    });

    it('skips CSS that imports tailwindcss directly (double quotes)', () => {
      const css =
        '@import "tailwindcss" prefix(sa);\n.demo { @apply sa:flex; }';
      const result = callTransform(plugin, css, '/project/src/app/global.css');
      expect(result).toBeUndefined();
    });

    it('skips CSS that imports tailwindcss directly (single quotes)', () => {
      const css =
        "@import 'tailwindcss' prefix(sa);\n.demo { @apply sa:flex; }";
      const result = callTransform(plugin, css, '/project/src/app/global.css');
      expect(result).toBeUndefined();
    });

    it('skips CSS that references the root stylesheet by basename', () => {
      const css = `@import './tailwind.css';\n.demo { @apply sa:flex; }`;
      const result = callTransform(plugin, css, '/project/src/app/main.css');
      expect(result).toBeUndefined();
    });

    it('skips CSS that does not use the configured prefix', () => {
      // Plain CSS with no Tailwind utilities — should not get @reference
      const css = '.demo { display: flex; gap: 1rem; }';
      const result = callTransform(
        plugin,
        css,
        '/project/src/app/demo.component.css',
      );
      expect(result).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // Prefix detection
  // ---------------------------------------------------------------------------

  describe('prefix detection', () => {
    it('falls back to @apply detection when no prefixes are configured', () => {
      const plugin = getTailwindReferencePlugin({
        tailwindCss: { rootStylesheet: ROOT_CSS },
      })!;

      // Contains @apply but no specific prefix
      const css = '.demo { @apply flex gap-4; }';
      const result = callTransform(
        plugin,
        css,
        '/project/src/app/demo.component.css',
      );
      expect(result).toBe(`@reference "${ROOT_CSS}";\n${css}`);
    });

    it('does not inject for CSS without @apply when no prefixes configured', () => {
      const plugin = getTailwindReferencePlugin({
        tailwindCss: { rootStylesheet: ROOT_CSS },
      })!;

      const css = '.demo { display: flex; }';
      const result = callTransform(
        plugin,
        css,
        '/project/src/app/demo.component.css',
      );
      expect(result).toBeUndefined();
    });

    it('supports multiple configured prefixes', () => {
      const plugin = getTailwindReferencePlugin({
        tailwindCss: { rootStylesheet: ROOT_CSS, prefixes: ['sa:', 'tw:'] },
      })!;

      // Uses tw: prefix (second in the list)
      const css = '.demo { @apply tw:text-red-500; }';
      const result = callTransform(
        plugin,
        css,
        '/project/src/app/demo.component.css',
      );
      expect(result).toBe(`@reference "${ROOT_CSS}";\n${css}`);
    });
  });
});

// =============================================================================
// hasComponent detection
//
// When useAngularCompilationAPI is enabled, the Vite transform hook receives
// already-compiled code (decorators stripped), so hasComponent is always false.
// These tests document the expected behavior for both compilation paths.
// =============================================================================

describe('hasComponent detection', () => {
  it('detects @Component in raw TypeScript source (legacy path)', () => {
    // Simulates what the legacy (non-API) compilation path sees
    const rawTs = `
      import { Component } from '@angular/core';
      @Component({ selector: 'app-demo', template: '<div>hi</div>' })
      export class DemoComponent {}
    `;
    expect(rawTs.includes('@Component')).toBe(true);
  });

  it('does NOT detect @Component in compiled output (useAngularCompilationAPI path)', () => {
    // Simulates what the Vite transform hook sees after Angular compilation —
    // @Component is compiled into ɵɵdefineComponent(), so the naive string
    // check returns false. This is expected and documented behavior.
    const compiledJs = `
      import * as i0 from "@angular/core";
      export class DemoComponent {}
      DemoComponent.ɵcmp = i0.ɵɵdefineComponent({
        type: DemoComponent,
        selectors: [["app-demo"]],
        decls: 1,
        template: function(rf, ctx) { if (rf & 1) { i0.ɵɵelement(0, "div"); } }
      });
    `;
    expect(compiledJs.includes('@Component')).toBe(false);
  });
});
