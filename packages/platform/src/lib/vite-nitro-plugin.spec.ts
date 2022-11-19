import { describe, expect, it, vi } from 'vitest';
import { viteNitroPlugin } from './vite-nitro-plugin';

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
    expect(viteNitroPlugin({}).name).toEqual('vite-nitro-plugin');
  });

  it(`should not call the route middleware in test mode `, async () => {
    // Arrange
    const spy = vi.spyOn(mockViteDevServer.middlewares, 'use');

    // Act
    await (viteNitroPlugin({}).configureServer as any)(mockViteDevServer);

    // Assert
    expect(spy).toHaveBeenCalledTimes(0);
    expect(spy).not.toHaveBeenCalledWith('/api', expect.anything());
  });
});
