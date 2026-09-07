import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createCompilerPlugin,
  createRolldownCompilerPlugin,
} from './compiler-plugin.js';

const state = vi.hoisted(() => ({
  created: 0,
  transform: vi.fn<(file: string) => Promise<Uint8Array>>(),
  close: vi.fn<() => Promise<void>>(),
}));
vi.mock('./utils/devkit.js', () => ({
  JavaScriptTransformer: class {
    constructor() {
      state.created++;
    }
    transformFile = state.transform;
    close = state.close;
  },
}));

const options = {
  tsconfig: 'tsconfig.spec.json',
  sourcemap: false,
  incremental: false,
};
async function backend(kind: string, isTest = false, owned = true) {
  const finalizers: (() => Promise<void>)[] = [];
  const own = (finalizer: () => Promise<void>) => {
    finalizers.push(finalizer);
  };
  const closeOwner = async () => {
    for (const close of finalizers) await close();
  };
  if (kind === 'esbuild') {
    const onLoad = vi.fn();
    const onEnd = vi.fn();
    const plugin = createCompilerPlugin({
      own,
      compiler: options,
      isTest,
      closeTransformer: owned,
    });
    await Reflect.apply(plugin.setup, undefined, [{ onLoad, onEnd }]);
    const load = onLoad.mock.calls[0]?.[1];
    return {
      closeOwner,
      load: load && ((file: string) => load({ path: file })),
      close: onEnd.mock.calls[0]?.[0],
    };
  }
  const plugin = createRolldownCompilerPlugin({
    own,
    compiler: options,
    isTest,
    closeTransformer: owned,
  });
  const load = plugin.load;
  const end = plugin.buildEnd;
  return {
    closeOwner,
    load:
      load && typeof load === 'object'
        ? (file: string) => Reflect.apply(load.handler, {}, [file])
        : undefined,
    close:
      typeof end === 'function' ? () => Reflect.apply(end, {}, []) : undefined,
  };
}

describe.each(['esbuild', 'rolldown'])('%s dependency transformer', (kind) => {
  beforeEach(() => {
    state.created = 0;
    state.transform
      .mockReset()
      .mockResolvedValue(new TextEncoder().encode('export const value = 1;'));
    state.close.mockReset().mockResolvedValue(undefined);
  });

  it.each([
    [true, true],
    [false, true],
    [false, false],
  ])(
    'preserves test=%s / owned=%s hooks without allocating',
    async (isTest, owned) => {
      const plugin = await backend(kind, isTest, owned);
      expect(!!plugin.load).toBe(!isTest);
      expect(!!plugin.close).toBe(owned);
      await plugin.close?.();
      expect(state.created).toBe(0);
      expect(state.close).not.toHaveBeenCalled();
    },
  );

  it('reuses a transformer within a build and reacquires after rebuilding', async () => {
    const plugin = await backend(kind);
    await plugin.load('first.js');
    await plugin.load('second.js');
    expect(state.created).toBe(1);
    await plugin.close();
    await plugin.close();
    expect(state.close).toHaveBeenCalledTimes(1);
    await plugin.load('third.js');
    expect(state.created).toBe(2);
    await plugin.close();
    expect(state.close).toHaveBeenCalledTimes(2);
  });

  it('releases externally retained transformers through their compiler owner', async () => {
    const plugin = await backend(kind, false, false);
    await plugin.load('retained.js');
    expect(plugin.close).toBeUndefined();
    expect(state.close).not.toHaveBeenCalled();
    await plugin.closeOwner();
    await plugin.closeOwner();
    expect(state.close).toHaveBeenCalledTimes(1);
  });

  it('keeps the transformer alive until non-abortable work settles', async () => {
    const started = Promise.withResolvers<void>();
    const release = Promise.withResolvers<Uint8Array>();
    state.transform.mockImplementation(() => {
      started.resolve();
      return release.promise;
    });
    const plugin = await backend(kind);
    const work = plugin.load('pending.js');
    await started.promise;
    const closing = plugin.close();
    expect(state.close).not.toHaveBeenCalled();
    release.resolve(new Uint8Array());
    await expect(work).resolves.toBeDefined();
    await closing;
    expect(state.close).toHaveBeenCalledTimes(1);
  });

  it('preserves transform errors and releases the acquired resource', async () => {
    const error = new Error('linker failed');
    state.transform.mockRejectedValueOnce(error);
    const plugin = await backend(kind);
    await expect(plugin.load('broken.js')).rejects.toBe(error);
    await plugin.close();
    expect(state.close).toHaveBeenCalledTimes(1);
  });
});
