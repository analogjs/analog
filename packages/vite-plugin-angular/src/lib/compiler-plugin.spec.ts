import { describe, expect, it } from 'vitest';
import { createRolldownCompilerPlugin } from './compiler-plugin.js';

const pluginOptions = {
  tsconfig: 'tsconfig.spec.json',
  sourcemap: false,
  incremental: false,
};

describe('createRolldownCompilerPlugin', () => {
  it('skips the dependency transform in test mode', () => {
    const plugin = createRolldownCompilerPlugin(pluginOptions, true, true);

    expect(plugin.load).toBeUndefined();
  });

  it('keeps the dependency transform outside test mode', () => {
    const plugin = createRolldownCompilerPlugin(pluginOptions, false, true);

    expect(plugin.load).toBeDefined();
  });

  it('closes the JavaScript transformer when the build ends', async () => {
    const plugin = createRolldownCompilerPlugin(pluginOptions, false, true);

    expect(plugin.buildEnd).toBeDefined();
    await expect(
      (plugin.buildEnd as unknown as () => Promise<void>)(),
    ).resolves.toBeUndefined();
  });

  it('keeps the transformer open when closeTransformer is false', () => {
    const plugin = createRolldownCompilerPlugin(pluginOptions, false, false);

    expect(plugin.buildEnd).toBeUndefined();
  });
});
