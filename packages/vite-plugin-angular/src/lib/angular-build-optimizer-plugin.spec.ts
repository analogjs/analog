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
