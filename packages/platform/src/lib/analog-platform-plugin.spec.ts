import { describe, expect, it, vi } from 'vitest';
import { analogPlatform } from './analog-platform-plugin';

const mockViteDevServer = {
  middlewares: {
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    use: () => {},
  },
};

describe('analogPlatformVitePlugin', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should work', () => {
    expect(analogPlatform({}).name).toEqual('vite-nitro-plugin');
  });

  it(`should have the route middleware "/api" `, async () => {
    // Arrange
    const spy = vi.spyOn(mockViteDevServer.middlewares, 'use');

    // Act
    await (analogPlatform({}).configureServer as any)(mockViteDevServer);

    // Assert
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith('/api', expect.anything());
  });
});
