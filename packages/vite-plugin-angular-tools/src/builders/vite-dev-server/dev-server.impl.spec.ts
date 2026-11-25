// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createServerConfig } from './dev-server.impl';

describe('vite-dev-server builder', () => {
  it('passes host, port and hmr to the Vite server config', () => {
    const config = createServerConfig(
      { buildTarget: 'app:build', host: '0.0.0.0', port: 3000, hmr: false },
      { configFile: 'vite.config.ts', mode: 'development' },
      'apps/app',
    );

    expect(config.server).toEqual({ host: '0.0.0.0', port: 3000, hmr: false });
  });

  it('accepts host: true to listen on all addresses', () => {
    const config = createServerConfig(
      { buildTarget: 'app:build', host: true },
      {},
      'apps/app',
    );

    expect(config.server?.host).toBe(true);
  });

  it('leaves host unset by default so Vite keeps its localhost default', () => {
    const config = createServerConfig(
      { buildTarget: 'app:build' },
      {},
      'apps/app',
    );

    expect(config.server?.host).toBeUndefined();
  });
});
