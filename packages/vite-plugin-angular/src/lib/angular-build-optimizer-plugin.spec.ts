import { describe, it, expect } from 'vitest';
import type { Plugin, UserConfig } from 'vite';
import { buildOptimizerPlugin } from './angular-build-optimizer-plugin';

function createPlugin(): Plugin {
  return buildOptimizerPlugin({
    supportedBrowsers: [],
    jit: false,
  });
}

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
