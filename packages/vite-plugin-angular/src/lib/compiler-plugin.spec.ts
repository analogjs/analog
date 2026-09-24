import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PluginBuild } from 'esbuild';
import {
  createCompilerPlugin,
  createRolldownCompilerPlugin,
} from './compiler-plugin.js';

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

const pluginOptions = {
  tsconfig: 'tsconfig.spec.json',
  sourcemap: false,
  incremental: false,
};
const cache = { get: vi.fn(), put: vi.fn() };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.transformFile.mockResolvedValue(Buffer.from('export {};'));
  mocks.close.mockResolvedValue(undefined);
});

describe.each(['esbuild', 'rolldown'] as const)(
  '%s compiler plugin',
  (bundler) => {
    async function createPlugin(isTest = false, closeTransformer = true) {
      if (bundler === 'rolldown') {
        const plugin = createRolldownCompilerPlugin(
          pluginOptions,
          isTest,
          closeTransformer,
          cache,
        );
        return {
          load: (plugin.load as { handler: (id: string) => Promise<unknown> })
            ?.handler,
          close: plugin.buildEnd as
            | (() => Promise<void> | undefined)
            | undefined,
        };
      }

      const plugin = createCompilerPlugin(
        pluginOptions,
        isTest,
        closeTransformer,
        cache,
      );
      const onLoad = vi.fn();
      const onEnd = vi.fn();
      await plugin.setup({ onLoad, onEnd } as unknown as PluginBuild);
      const load = onLoad.mock.calls[0]?.[1];
      return {
        load: load ? (path: string) => load({ path }) : undefined,
        close: onEnd.mock.calls[0]?.[0] as (() => Promise<void>) | undefined,
      };
    }

    it.each([false, true])(
      'does not construct a transformer during setup or unused cleanup (isTest: %s)',
      async (isTest) => {
        const plugin = await createPlugin(isTest);

        expect(mocks.constructor).not.toHaveBeenCalled();
        expect(!!plugin.load).toBe(!isTest);
        expect(plugin.close).toBeDefined();
        await plugin.close!();
        expect(mocks.constructor).not.toHaveBeenCalled();
        expect(mocks.close).not.toHaveBeenCalled();
      },
    );

    it('creates one transformer on first load, reuses it, and closes it', async () => {
      const plugin = await createPlugin();

      const result = await plugin.load!('/dep.mjs');
      await plugin.load!('/other.mjs');

      expect(mocks.constructor).toHaveBeenCalledExactlyOnceWith(
        { ...pluginOptions, jit: true },
        1,
        cache,
      );
      expect(mocks.transformFile.mock.calls).toEqual([
        ['/dep.mjs'],
        ['/other.mjs'],
      ]);
      expect(result).toEqual(
        bundler === 'rolldown'
          ? { code: 'export {};', loader: 'js' }
          : { contents: Buffer.from('export {};'), loader: 'js' },
      );
      await plugin.close!();
      expect(mocks.close).toHaveBeenCalledOnce();
    });

    it('keeps the transformer open when closeTransformer is false', async () => {
      const plugin = await createPlugin(false, false);
      await plugin.load!('/dep.mjs');

      expect(plugin.close).toBeUndefined();
      expect(mocks.close).not.toHaveBeenCalled();
    });
  },
);
