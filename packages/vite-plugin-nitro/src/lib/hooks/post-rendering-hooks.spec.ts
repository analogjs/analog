import { runPostRenderingHooks } from './post-rendering-hook';
import { vi } from 'vitest';
import { Nitro } from 'nitropack';

describe('postRenderingHook', () => {
  const genRoute = {
    route: 'test/testRoute',
    contents: 'This is a test.',
  };

  const nitroMock = {
    hooks: {
      hook: vi.fn((name: string, callback: (route) => void) =>
        callback(genRoute)
      ),
    },
  } as Nitro;

  const mockFunc1 = vi.fn();
  const mockFunc2 = vi.fn();

  it('should not attempt to call nitro mocks if no callbacks provided', () => {
    runPostRenderingHooks(nitroMock, []);
    expect(nitroMock.hooks.hook).not.toHaveBeenCalled();
  });

  it('should call provided hooks', () => {
    runPostRenderingHooks(nitroMock, [mockFunc1, mockFunc2]);
    expect(mockFunc1).toHaveBeenCalledWith(genRoute);
    expect(mockFunc2).toHaveBeenCalled(genRoute);
  });
});
