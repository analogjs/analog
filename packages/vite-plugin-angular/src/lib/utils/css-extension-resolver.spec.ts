import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ResolvedConfig } from 'vite';

// Capture every `createIdResolver(config, options)` invocation plus every
// resulting resolver call. The plugin's two code paths (Vite 7 via
// `config.createResolver` and Vite 8 via `vite.createIdResolver`) both
// route through these arrays, so a single test surface covers both.
const factoryCalls: any[] = [];
const resolverCalls: any[] = [];
let resolverReturn: string | undefined = undefined;

vi.mock('vite', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vite')>();
  return {
    ...actual,
    // Override Vite 8's exported resolver factory so the test owns
    // resolution. The plugin prefers this path when present, so this
    // mock alone exercises the Vite 8 code path.
    createIdResolver: (config: any, options: any) => {
      factoryCalls.push({ config, options });
      return async (
        environment: { name: string },
        id: string,
        importer: string | undefined,
      ) => {
        resolverCalls.push({ environment, id, importer });
        return resolverReturn;
      };
    },
  };
});

// Import after the mock so the module-under-test sees the replaced `vite`.
const { cssExtensionStyleResolverPlugin } =
  await import('./css-extension-resolver.js');

beforeEach(() => {
  factoryCalls.length = 0;
  resolverCalls.length = 0;
  resolverReturn = undefined;
});

afterEach(() => {
  vi.restoreAllMocks();
});

function makePlugin() {
  const plugin = cssExtensionStyleResolverPlugin();
  const fakeConfig = {
    resolve: { conditions: ['module', 'browser'] },
  } as unknown as ResolvedConfig;
  ((plugin as any).configResolved as (c: ResolvedConfig) => void)(fakeConfig);
  return plugin;
}

async function callResolveId(
  plugin: ReturnType<typeof cssExtensionStyleResolverPlugin>,
  id: string,
  importer?: string,
) {
  const resolveId = (plugin as any).resolveId as (
    this: { environment?: { name: string } },
    id: string,
    importer: string | undefined,
  ) => Promise<string | null | undefined>;
  return await resolveId.call(
    { environment: { name: 'client' } },
    id,
    importer,
  );
}

describe('cssExtensionStyleResolverPlugin', () => {
  it('appends `style` to the scoped resolver conditions only', () => {
    makePlugin();
    expect(factoryCalls).toHaveLength(1);
    expect(factoryCalls[0].options.conditions).toEqual([
      'module',
      'browser',
      'style',
    ]);
  });

  it('fires for bare-specifier `.css` imports', async () => {
    const plugin = makePlugin();
    // Reproduces the @angular/material/prebuilt-themes/* case — a CSS
    // export gated only under the `style` package-export condition. The
    // plugin must route through the scoped resolver so `style` is in
    // scope.
    await callResolveId(
      plugin,
      '@angular/material/prebuilt-themes/azure-blue.css',
    );
    // Query-suffixed CSS imports must also pass through the scoped
    // resolver — `?inline` and `?module` are common Vite CSS suffixes.
    await callResolveId(plugin, 'some-pkg/theme.css?inline');
    await callResolveId(plugin, 'some-pkg/theme.css?module');

    expect(resolverCalls.map((c) => c.id)).toEqual([
      '@angular/material/prebuilt-themes/azure-blue.css',
      'some-pkg/theme.css?inline',
      'some-pkg/theme.css?module',
    ]);
  });

  it('does not fire for non-`.css` bare specifiers', async () => {
    const plugin = makePlugin();
    // Reproduces the tailwindcss-primeui case: a package whose `.`
    // exports include both `style` and `import`. The plugin must NOT
    // intercept here, so Vite's default resolver picks `import` and
    // returns the JS plugin file. Otherwise Tailwind v4's `@plugin`
    // directive ends up loading a `.css` file as a JS module.
    await callResolveId(plugin, 'tailwindcss-primeui');
    await callResolveId(plugin, '@angular/material/button');
    await callResolveId(plugin, 'rxjs');

    expect(resolverCalls).toHaveLength(0);
  });

  it('does not fire for relative, absolute, virtual, or data: ids', async () => {
    const plugin = makePlugin();
    // Vite's normal resolver already handles these without consulting
    // package exports, so the `style` condition is irrelevant — and
    // intercepting them would shadow Vite's own CSS pipeline.
    await callResolveId(plugin, './local.css');
    await callResolveId(plugin, '../sibling/theme.css');
    await callResolveId(plugin, '/abs/path/file.css');
    // Vite POSIX-normalizes Windows absolute paths to `C:/...` form;
    // those still represent absolute filesystem ids and must skip the
    // package-exports lookup.
    await callResolveId(plugin, 'C:/abs/path/file.css');
    await callResolveId(plugin, 'd:/abs/path/file.css');
    await callResolveId(plugin, '\0virtual:tailwind:reference.css');
    await callResolveId(plugin, 'virtual:tailwindcss-references.css');
    await callResolveId(plugin, 'data:text/css,body{}');

    expect(resolverCalls).toHaveLength(0);
  });

  it('returns the resolver-supplied path when the resolver matches', async () => {
    const plugin = makePlugin();
    resolverReturn =
      '/abs/node_modules/@angular/material/prebuilt-themes/azure-blue.css';

    const resolved = await callResolveId(
      plugin,
      '@angular/material/prebuilt-themes/azure-blue.css',
      '/project/main.ts',
    );

    expect(resolved).toBe(
      '/abs/node_modules/@angular/material/prebuilt-themes/azure-blue.css',
    );
  });

  it('returns null when the scoped resolver does not match', async () => {
    const plugin = makePlugin();
    resolverReturn = undefined;

    const resolved = await callResolveId(plugin, 'unresolvable-pkg/theme.css');

    expect(resolved).toBeNull();
  });
});
