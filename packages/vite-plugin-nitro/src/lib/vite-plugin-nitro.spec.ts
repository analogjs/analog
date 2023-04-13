import { describe, expect, it, vi } from 'vitest';
import { nitro } from './vite-plugin-nitro';

const mockViteDevServer = {
  middlewares: {
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    use: () => {},
  },
};

describe('viteNitroPlugin', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should work', () => {
    expect(nitro({}).name).toEqual('analogjs-vite-nitro-plugin');
  });

  it(`should not call the route middleware in test mode `, async () => {
    // Arrange
    const spy = vi.spyOn(mockViteDevServer.middlewares, 'use');

    // Act
    await (nitro({}).configureServer as any)(mockViteDevServer);

    // Assert
    expect(spy).toHaveBeenCalledTimes(0);
    expect(spy).not.toHaveBeenCalledWith('/api', expect.anything());
  });
});
