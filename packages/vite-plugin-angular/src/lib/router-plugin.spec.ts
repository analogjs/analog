import { beforeEach, describe, expect, it, vi } from 'vitest';
import { routerPlugin } from './router-plugin.js';

const mocks = vi.hoisted(() => ({
  constructor: vi.fn(),
  transformFile: vi.fn(),
  close: vi.fn(),
}));

vi.mock('./utils/devkit.js', () => ({
  JavaScriptTransformer: class {
    constructor(...args: unknown[]) {
      mocks.constructor(...args);
    }
    transformFile = mocks.transformFile;
    close = mocks.close;
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.transformFile.mockResolvedValue(Buffer.from('export {};'));
  mocks.close.mockResolvedValue(undefined);
});

describe('routerPlugin transformer lifecycle', () => {
  it('does not construct a transformer for an unused plugin, including cleanup', async () => {
    const plugin = routerPlugin();

    expect(mocks.constructor).not.toHaveBeenCalled();
    await (plugin.buildEnd as () => Promise<void> | undefined)();
    expect(mocks.constructor).not.toHaveBeenCalled();
    expect(mocks.close).not.toHaveBeenCalled();
  });

  it('creates one transformer on first transform, reuses it, and closes it', async () => {
    const plugin = routerPlugin();
    const transform = (
      plugin.transform as {
        handler: (code: string, id: string) => Promise<{ code: string }>;
      }
    ).handler;

    expect(await transform('', '/fesm2022/dep.mjs?v=1')).toEqual({
      code: 'export {};',
    });
    await transform('', '/fesm2022/other.mjs');

    expect(mocks.constructor).toHaveBeenCalledExactlyOnceWith(
      { jit: true },
      1,
      expect.objectContaining({
        get: expect.any(Function),
        put: expect.any(Function),
      }),
    );
    expect(mocks.transformFile.mock.calls).toEqual([
      ['/fesm2022/dep.mjs'],
      ['/fesm2022/other.mjs'],
    ]);
    await (plugin.buildEnd as () => Promise<void>)();
    expect(mocks.close).toHaveBeenCalledOnce();
  });
});
