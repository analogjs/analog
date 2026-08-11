import { afterEach, describe, it, expect } from 'vitest';
import type { Plugin, UserConfig } from 'vite';
import { buildOptimizerPlugin } from './angular-build-optimizer-plugin';

function createPlugin(vendorSourcemaps = false): Plugin {
  return buildOptimizerPlugin({
    supportedBrowsers: [],
    jit: false,
    vendorSourcemaps,
  });
}

describe('buildOptimizerPlugin apply()', () => {
  const originalNodeEnv = process.env['NODE_ENV'];
  afterEach(() => {
    process.env['NODE_ENV'] = originalNodeEnv;
  });

  function apply(command: 'build' | 'serve'): boolean {
    const fn = createPlugin().apply as (
      c: UserConfig,
      env: { command: 'build' | 'serve' },
    ) => boolean;
    return fn({}, { command });
  }

  it('applies during build', () => {
    process.env['NODE_ENV'] = 'development';
    expect(apply('build')).toBe(true);
  });

  it('applies in a serve-style pipeline under production NODE_ENV (#2438)', () => {
    // Astro's Cloudflare integration transforms SSR modules through a
    // serve-style `workerd` runner during `astro build` (which sets a
    // production NODE_ENV). The linker must run there.
    process.env['NODE_ENV'] = 'production';
    expect(apply('serve')).toBe(true);
  });

  it('stays off for a regular development serve (unchanged behavior)', () => {
    process.env['NODE_ENV'] = 'development';
    expect(apply('serve')).toBe(false);
  });
});

describe('buildOptimizerPlugin config()', () => {
  it('should set ngServerMode to true for production SSR builds', () => {
    const plugin = createPlugin();
    const config = (
      plugin as Plugin & { config: (c: UserConfig) => UserConfig }
    ).config({ mode: 'production', build: { ssr: true } });

    expect(config.define).toEqual(
      expect.objectContaining({ ngServerMode: 'true' }),
    );
  });

  it('should set ngServerMode to false for production client builds', () => {
    const plugin = createPlugin();
    const config = (
      plugin as Plugin & { config: (c: UserConfig) => UserConfig }
    ).config({ mode: 'production', build: { ssr: false } });

    expect(config.define).toEqual(
      expect.objectContaining({ ngServerMode: 'false' }),
    );
  });

  it('should set ngServerMode to false when build.ssr is undefined', () => {
    const plugin = createPlugin();
    const config = (
      plugin as Plugin & { config: (c: UserConfig) => UserConfig }
    ).config({ mode: 'production' });

    expect(config.define).toEqual(
      expect.objectContaining({ ngServerMode: 'false' }),
    );
  });

  it('should not set defines in non-production mode', () => {
    const plugin = createPlugin();
    const config = (
      plugin as Plugin & { config: (c: UserConfig) => UserConfig }
    ).config({ mode: 'development' });

    expect(config.define).toEqual({});
  });
});

describe('buildOptimizerPlugin transform filter', () => {
  function filterId(): RegExp {
    return (createPlugin().transform as any).filter.id as RegExp;
  }

  it('matches Angular fesm modules carrying a `?v=<hash>` query (#2438)', () => {
    // Regression: Cloudflare's `workerd` runner (Astro's Cloudflare
    // integration) references optimized deps with a query suffix. A
    // `$`-anchored extension match skipped these, so the linker never ran and
    // the partially-compiled package fell back to the JIT compiler at runtime.
    const re = filterId();
    expect(re.test('/x/fesm2022/_platform_location-chunk.mjs?v=a786a9ff')).toBe(
      true,
    );
    expect(re.test('/x/fesm2022/common.mjs?v=abc123')).toBe(true);
    expect(re.test('/x/foo.js?v=1')).toBe(true);
    expect(re.test('/x/foo.cjs?v=1')).toBe(true);
  });

  it('still matches plain .js/.cjs/.mjs and rejects non-JS ids', () => {
    const re = filterId();
    expect(re.test('/x/foo.js')).toBe(true);
    expect(re.test('/x/foo.cjs')).toBe(true);
    expect(re.test('/x/foo.mjs')).toBe(true);
    expect(re.test('/x/foo.json')).toBe(false);
    expect(re.test('/x/foo.ts')).toBe(false);
    expect(re.test('/x/foo.css?v=1')).toBe(false);
  });
});

describe('buildOptimizerPlugin vendorSourcemaps', () => {
  const originalNodeEnv = process.env['NODE_ENV'];
  afterEach(() => {
    process.env['NODE_ENV'] = originalNodeEnv;
  });

  async function transform(
    plugin: Plugin,
    code: string,
    id: string,
  ): Promise<{ code: string; map?: unknown } | null | undefined> {
    return (plugin.transform as any).handler.call({}, code, id);
  }

  function configure(plugin: Plugin, mode: 'production' | 'development'): void {
    process.env['NODE_ENV'] = mode;
    (plugin as Plugin & { config: (c: UserConfig) => UserConfig }).config({
      mode,
    });
  }

  const sourceWithMapUrl = 'const a = 1;\n//# sourceMappingURL=vendor.js.map\n';

  it('discards vendor sourcemaps by default in development (unchanged behavior)', async () => {
    const plugin = createPlugin();
    configure(plugin, 'development');

    const result = await transform(plugin, sourceWithMapUrl, '/x/vendor.js');

    expect(result?.map).toEqual({ mappings: '' });
    // The `sourceMappingURL` comment is only stripped in production.
    expect(result?.code).toBe(sourceWithMapUrl);
  });

  it('discards vendor sourcemaps by default in production, stripping the map comment', async () => {
    const plugin = createPlugin();
    configure(plugin, 'production');

    const result = await transform(plugin, sourceWithMapUrl, '/x/vendor.js');

    expect(result?.map).toEqual({ mappings: '' });
    expect(result?.code).not.toContain('sourceMappingURL');
  });

  it('preserves vendor sourcemaps when enabled in development', async () => {
    const plugin = createPlugin(true);
    configure(plugin, 'development');

    const result = await transform(plugin, sourceWithMapUrl, '/x/vendor.js');

    expect(result?.map).toBeNull();
    expect(result?.code).toBe(sourceWithMapUrl);
  });

  it('preserves vendor sourcemaps when enabled in production, keeping the map comment', async () => {
    // The prod-only `sourceMappingURL` strip would make the map unreachable,
    // so it must not run while the option is enabled.
    const plugin = createPlugin(true);
    configure(plugin, 'production');

    const result = await transform(plugin, sourceWithMapUrl, '/x/vendor.js');

    expect(result?.map).toBeNull();
    expect(result?.code).toBe(sourceWithMapUrl);
  });
});
