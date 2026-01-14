import { describe, it, expect, vi } from 'vitest';
import { viteFinal } from './preset';

describe('viteFinal', () => {
  const createMockOptions = (overrides = {}) => ({
    configDir: '.storybook',
    presets: {
      apply: vi.fn().mockResolvedValue({ options: {} }),
    },
    angularBuilderOptions: {},
    ...overrides,
  });

  describe('when angularBuilderContext is undefined', () => {
    it('should not crash during plugin initialization', async () => {
      const config = { plugins: [] };
      const options = createMockOptions({
        // angularBuilderContext is intentionally undefined
      });

      await expect(viteFinal(config, options)).resolves.not.toThrow();
    });

    it('should return a valid vite config', async () => {
      const config = { plugins: [] };
      const options = createMockOptions();

      const result = await viteFinal(config, options);

      expect(result).toBeDefined();
      expect(result.plugins).toBeDefined();
      expect(Array.isArray(result.plugins)).toBe(true);
    });

    it('should include the angular options plugin', async () => {
      const config = { plugins: [] };
      const options = createMockOptions();

      const result = await viteFinal(config, options);

      const angularOptionsPlugin = result.plugins
        .flat()
        .find((p) => p?.name === 'analogjs-storybook-options-plugin');
      expect(angularOptionsPlugin).toBeDefined();
    });

    it('should handle stylePreprocessorOptions.loadPaths without angularBuilderContext', async () => {
      const config = { plugins: [] };
      const options = createMockOptions({
        angularBuilderOptions: {
          stylePreprocessorOptions: {
            loadPaths: ['src/styles'],
          },
        },
        // angularBuilderContext is intentionally undefined
      });

      // Should not crash when processing loadPaths
      await expect(viteFinal(config, options)).resolves.not.toThrow();
    });
  });

  describe('when angularBuilderContext is available', () => {
    it('should use angularBuilderContext.workspaceRoot for loadPaths', async () => {
      const config = { plugins: [] };
      const options = createMockOptions({
        angularBuilderOptions: {
          stylePreprocessorOptions: {
            loadPaths: ['src/styles'],
          },
        },
        angularBuilderContext: {
          workspaceRoot: '/workspace/root',
        },
      });

      const result = await viteFinal(config, options);

      const angularOptionsPlugin = result.plugins
        .flat()
        .find((p) => p?.name === 'analogjs-storybook-options-plugin');

      // Call the config hook to get the scss config
      const pluginConfig = angularOptionsPlugin?.config?.({
        root: '/vite/root',
      });

      expect(
        pluginConfig?.css?.preprocessorOptions?.scss?.loadPaths?.[0],
      ).toContain('/workspace/root');
    });
  });
});
