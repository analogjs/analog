import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const construct = vi.fn();
  const transformFile = vi.fn();
  const transformData = vi.fn();
  const close = vi.fn();
  return {
    angularVersion: { major: '22', minor: '2', patch: '0' },
    initializeHash: vi.fn(),
    construct,
    transformFile,
    transformData,
    close,
    JavaScriptTransformer: class {
      constructor(...args: unknown[]) {
        construct(...args);
      }
      transformFile(...args: unknown[]) {
        return transformFile(...args);
      }
      transformData(...args: unknown[]) {
        return transformData(...args);
      }
      close() {
        return close();
      }
    },
  };
});

vi.mock('@angular/compiler-cli', () => ({
  VERSION: mocks.angularVersion,
}));
vi.mock('node:module', () => ({
  createRequire: () =>
    Object.assign(
      (id: string) => {
        if (id === '@angular/build/private')
          return { JavaScriptTransformer: mocks.JavaScriptTransformer };
        if (id.endsWith('/src/utils/hash.js'))
          return { initializeHash: mocks.initializeHash };
        throw new Error(`Unexpected require: ${id}`);
      },
      { resolve: () => '/angular/build/package.json' },
    ),
}));

describe('JavaScriptTransformer compatibility', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
    Object.assign(mocks.angularVersion, {
      major: '22',
      minor: '2',
      patch: '0',
    });
  });

  it('preserves the legacy API before Angular 22.2', async () => {
    Object.assign(mocks.angularVersion, { minor: '1', patch: '8' });
    const { JavaScriptTransformer } = await import('./devkit');
    const options = { jit: true };
    const cache = { get: vi.fn(), put: vi.fn() };
    const transformer = new JavaScriptTransformer(options, 1, cache);
    await transformer.transformFile('file.js', true, false, true);
    await transformer.transformData('file.js', 'code', false, true);
    await transformer.close();

    expect(mocks.construct).toHaveBeenCalledWith(options, 1, cache);
    expect(mocks.transformFile).toHaveBeenCalledWith(
      'file.js',
      true,
      false,
      true,
    );
    expect(mocks.transformData).toHaveBeenCalledWith(
      'file.js',
      'code',
      false,
      true,
      undefined,
    );
    expect(mocks.initializeHash).not.toHaveBeenCalled();
    expect(mocks.close).toHaveBeenCalledOnce();
  });

  it.each([false, true])(
    'awaits hash initialization and preserves sideEffects=%s on Angular 22.2',
    async (sideEffects) => {
      let initialized!: () => void;
      mocks.initializeHash.mockReturnValue(
        new Promise<void>((resolve) => {
          initialized = resolve;
        }),
      );
      const { JavaScriptTransformer } = await import('./devkit');
      const cache = { get: vi.fn(), put: vi.fn() };
      const transformer = new JavaScriptTransformer({ jit: true }, 1, cache);
      const file = transformer.transformFile(
        'file.js',
        true,
        sideEffects,
        true,
      );
      const data = transformer.transformData(
        'file.js',
        'code',
        false,
        sideEffects,
      );

      expect(mocks.construct).toHaveBeenCalledWith(
        { jit: true, maxConcurrency: 1 },
        cache,
      );
      expect(mocks.transformFile).not.toHaveBeenCalled();
      expect(mocks.transformData).not.toHaveBeenCalled();
      initialized();
      await Promise.all([file, data]);
      expect(mocks.transformFile).toHaveBeenCalledWith('file.js', {
        skipLinker: true,
        sideEffects: expect.any(Function),
        instrumentForCoverage: true,
      });
      expect(mocks.transformData).toHaveBeenCalledWith('file.js', 'code', {
        skipLinker: false,
        sideEffects: expect.any(Function),
        instrumentForCoverage: undefined,
      });
      expect(await mocks.transformFile.mock.calls[0][1].sideEffects()).toBe(
        sideEffects,
      );
      expect(await mocks.transformData.mock.calls[0][2].sideEffects()).toBe(
        sideEffects,
      );
    },
  );

  it('leaves an unspecified cache and side-effect resolver unset', async () => {
    const { JavaScriptTransformer } = await import('./devkit');
    const transformer = new JavaScriptTransformer({ jit: true }, 1);
    await transformer.transformFile('file.js');
    expect(mocks.construct).toHaveBeenCalledWith(
      { jit: true, maxConcurrency: 1 },
      undefined,
    );
    expect(mocks.transformFile.mock.calls[0][1].sideEffects).toBeUndefined();
  });
});
