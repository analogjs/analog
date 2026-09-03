import { afterEach, describe, it, expect } from 'vitest';
import type { Plugin, UserConfig } from 'vite';
import {
  buildOptimizerPlugin,
  extractInlineSourceMap,
} from './angular-build-optimizer-plugin';

function createPlugin(): Plugin {
  return buildOptimizerPlugin({
    supportedBrowsers: [],
    jit: false,
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
  const originalNodeEnv = process.env['NODE_ENV'];
  afterEach(() => {
    process.env['NODE_ENV'] = originalNodeEnv;
  });

  it('should not set defines for an explicit development mode build under production NODE_ENV (#2462)', () => {
    // `storybook build` sets NODE_ENV=production at CLI entry; an explicit
    // `mode: 'development'` opts the build into Angular's development
    // compilation so the debug API (e.g. `window.ng.getComponent`) survives.
    process.env['NODE_ENV'] = 'production';
    const plugin = createPlugin();
    const config = (
      plugin as Plugin & { config: (c: UserConfig) => UserConfig }
    ).config({ mode: 'development' });

    expect(config.define).toEqual({});
  });

  it('should set defines under production NODE_ENV without an explicit mode', () => {
    process.env['NODE_ENV'] = 'production';
    const plugin = createPlugin();
    const config = (
      plugin as Plugin & { config: (c: UserConfig) => UserConfig }
    ).config({});

    expect(config.define).toEqual(
      expect.objectContaining({ ngDevMode: 'false' }),
    );
  });

  it('does not re-enable Vite TypeScript transforms', () => {
    const plugin = createPlugin();
    const config = (
      plugin as Plugin & { config: (c: UserConfig) => UserConfig }
    ).config({ mode: 'production' });

    expect(config).not.toHaveProperty('oxc');
    expect(config).not.toHaveProperty('esbuild');
  });

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

describe('buildOptimizerPlugin vendor sourcemaps', () => {
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

  function configure(
    plugin: Plugin,
    mode: 'production' | 'development',
    sourcemap: boolean | 'inline' | 'hidden',
  ): void {
    process.env['NODE_ENV'] = mode;
    (plugin as Plugin & { config: (c: UserConfig) => UserConfig }).config({
      mode,
    });
    (plugin.configResolved as any).call({}, { build: { sourcemap } });
  }

  const sourceWithMapUrl = 'const a = 1;\n//# sourceMappingURL=vendor.js.map\n';

  it('discards vendor sourcemaps without build.sourcemap in development', async () => {
    const plugin = createPlugin();
    configure(plugin, 'development', false);

    const result = await transform(plugin, sourceWithMapUrl, '/x/vendor.js');

    expect(result?.map).toEqual({ mappings: '' });
    // The `sourceMappingURL` comment is only stripped in production.
    expect(result?.code).toBe(sourceWithMapUrl);
  });

  it('discards vendor sourcemaps without build.sourcemap in production, stripping the map comment', async () => {
    const plugin = createPlugin();
    configure(plugin, 'production', false);

    const result = await transform(plugin, sourceWithMapUrl, '/x/vendor.js');

    expect(result?.map).toEqual({ mappings: '' });
    expect(result?.code).not.toContain('sourceMappingURL');
  });

  it('preserves vendor sourcemaps when build.sourcemap is enabled, keeping the map comment', async () => {
    // The prod-only `sourceMappingURL` strip would make the preserved map
    // unreachable, so it must not run once sourcemaps are requested.
    const plugin = createPlugin();
    configure(plugin, 'production', true);

    const result = await transform(plugin, sourceWithMapUrl, '/x/vendor.js');

    expect(result?.map).toBeNull();
    expect(result?.code).toBe(sourceWithMapUrl);
  });

  it('treats non-boolean build.sourcemap values as enabled', async () => {
    // `build.sourcemap` also accepts 'inline' | 'hidden'.
    const plugin = createPlugin();
    configure(plugin, 'production', 'hidden');

    const result = await transform(plugin, sourceWithMapUrl, '/x/vendor.js');

    expect(result?.map).toBeNull();
    expect(result?.code).toBe(sourceWithMapUrl);
  });
});

describe('extractInlineSourceMap', () => {
  it('extracts base64 encoded sourcemap and removes sourceMappingURL comment', () => {
    const mapObj = {
      version: 3,
      file: 'test.js',
      sourceRoot: '',
      sources: ['test.ts', 'utils.ts'],
      sourcesContent: [
        `import { formatGreeting } from './utils';

export class Greeter {
  private prefix = 'Hello';

  constructor(public suffix: string = '!') {}

  greet(name: string): string {
    const greeting = formatGreeting(this.prefix, name, this.suffix);
    console.log(greeting);
    return greeting;
  }
}
`,
        `export function formatGreeting(prefix: string, name: string, suffix: string): string {
  return \`\${prefix}, \${name}\${suffix}\`;
}
`,
      ],
      names: [
        'Greeter',
        'prefix',
        'suffix',
        'greet',
        'name',
        'greeting',
        'formatGreeting',
        'console',
        'log',
      ],
      mappings:
        'AAAA,OAAO,EAAE,cAAc,EAAE,MAAM,SAAS,CAAC;AAEzC,OAAM,MAAO,OAAO;IAClB,OAAA,MAAe,GAAA,KAAO,CAAC;IAEvB,YAAA,OAAA,MAAc,GAAA,GAAG,CAAA,CAAE;IAEnB,KAAK,CAAC,IAAY;QAChB,MAAM,QAAQ,GAAG,cAAc,CAAC,IAAI,CAAC,MAAM,EAAE,IAAI,EAAE,IAAI,CAAC,MAAM,CAAC,CAAC;QAChE,OAAO,CAAC,GAAG,CAAC,QAAQ,CAAC,CAAC;QACtB,OAAO,QAAQ,CAAC;IAClB,CAAC;CACF',
      ignoreList: [],
    };
    const base64Map = Buffer.from(JSON.stringify(mapObj)).toString('base64');
    const sourceCode = `import { formatGreeting } from './utils';
export class Greeter {
  constructor(suffix = '!') {
    this.suffix = suffix;
    this.prefix = 'Hello';
  }
  greet(name) {
    const greeting = formatGreeting(this.prefix, name, this.suffix);
    console.log(greeting);
    return greeting;
  }
}`;
    const code = `${sourceCode}\n//# sourceMappingURL=data:application/json;base64,${base64Map}`;

    const result = extractInlineSourceMap(code, '/x/test.js');

    expect(result.code).toBe(sourceCode);
    expect(JSON.parse(result.map)).toEqual(mapObj);
  });

  it('supports charset parameter in data URI', () => {
    const mapObj = {
      version: 3,
      file: 'test.js',
      sources: ['test.ts'],
      sourcesContent: ['export const message = "hello world";\n'],
      names: ['message'],
      mappings: 'AAAA,OAAO,MAAMA,OAAO,GAAG,aAAa,CAAC',
    };
    const base64Map = Buffer.from(JSON.stringify(mapObj)).toString('base64');
    const sourceCode = 'export const message = "hello world";';
    const code = `${sourceCode}\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,${base64Map}`;

    const result = extractInlineSourceMap(code, '/x/test.js');

    expect(result.code).toBe(sourceCode);
    expect(JSON.parse(result.map)).toEqual(mapObj);
  });

  it('throws an error if no inline sourcemap is present', () => {
    expect(() =>
      extractInlineSourceMap('console.log("test");', '/x/test.js'),
    ).toThrow('Angular optimizer did not generate a source map for /x/test.js');
  });
});
