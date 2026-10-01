import { Nitro } from 'nitropack';
import { vi } from 'vitest';

import { addPostRenderingHooks } from './post-rendering-hook';

describe('postRenderingHook', () => {
  const genRoute = {
    route: 'test/testRoute',
    contents: 'This is a test.',
  };

  const nitroMock = {
    hooks: {
      hook: vi.fn((name: string, callback: (route: any) => void) =>
        callback(genRoute),
      ),
    },
  } as unknown as Nitro;

  const mockFunc1 = vi.fn();
  const mockFunc2 = vi.fn();

  it('should not attempt to call nitro mocks if no callbacks provided', () => {
    addPostRenderingHooks(nitroMock, []);
    expect(nitroMock.hooks.hook).not.toHaveBeenCalled();
  });

  it('returns asynchronous hook failures to Nitro', async () => {
    const hooks = { hook: vi.fn() };
    addPostRenderingHooks({ hooks } as unknown as Nitro, [
      async () => {
        await Promise.resolve();
        throw new Error('Post-render failed');
      },
    ]);
    await expect(hooks.hook.mock.calls[0][1](genRoute)).rejects.toThrow(
      'Post-render failed',
    );
  });

  it('should call provided hooks', () => {
    addPostRenderingHooks(nitroMock, [mockFunc1, mockFunc2]);
    expect(mockFunc1).toHaveBeenCalledWith(genRoute);
    expect(mockFunc2).toHaveBeenCalled();
  });
});
