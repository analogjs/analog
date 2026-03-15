import { describe, it, expect, vi, beforeEach } from 'vitest';
import { tsconfigPathsPlugin } from './tsconfig-paths-plugin';

// Mock oxc-resolver
const mockSync = vi.fn();
const mockConstructor = vi.fn();

vi.mock('oxc-resolver', () => ({
  ResolverFactory: class MockResolverFactory {
    constructor(options: any) {
      mockConstructor(options);
      this.sync = mockSync;
    }
    sync: typeof mockSync;
  },
}));

describe('tsconfigPathsPlugin', () => {
  beforeEach(() => {
    mockSync.mockReset();
    mockConstructor.mockReset();
  });

  it('should have the correct plugin name', () => {
    const plugin = tsconfigPathsPlugin();
    expect(plugin.name).toBe('analogjs-tsconfig-paths');
  });

  describe('configResolved', () => {
    it('should create resolver with config.root when no opts.root', async () => {
      const plugin = tsconfigPathsPlugin();
      await (plugin as any).configResolved({ root: '/project' });

      expect(mockConstructor).toHaveBeenCalledWith(
        expect.objectContaining({
          tsconfig: expect.objectContaining({
            configFile: expect.stringContaining('tsconfig.json'),
            references: 'auto',
          }),
          conditionNames: ['node', 'import'],
          symlinks: true,
        }),
      );
    });

    it('should resolve opts.root relative to config.root', async () => {
      const plugin = tsconfigPathsPlugin({ root: '../..' });
      await (plugin as any).configResolved({ root: '/project/apps/my-app' });

      expect(mockConstructor).toHaveBeenCalledWith(
        expect.objectContaining({
          tsconfig: expect.objectContaining({
            configFile: expect.stringContaining('tsconfig.json'),
          }),
        }),
      );
    });
  });

  describe('resolveId', () => {
    let plugin: ReturnType<typeof tsconfigPathsPlugin>;

    beforeEach(async () => {
      plugin = tsconfigPathsPlugin();
      await (plugin as any).configResolved({ root: '/project' });
    });

    it('should return null when no importer', () => {
      const result = plugin.resolveId!.call(
        {} as any,
        '@app/utils',
        undefined as any,
      );
      expect(result).toBeNull();
    });

    it('should return null for virtual modules (\\0 prefix)', () => {
      const result = plugin.resolveId!.call(
        {} as any,
        '\0virtual:module',
        '/project/src/app.ts',
      );
      expect(result).toBeNull();
    });

    it('should return null for relative imports', () => {
      expect(
        plugin.resolveId!.call({} as any, './utils', '/project/src/app.ts'),
      ).toBeNull();
      expect(
        plugin.resolveId!.call({} as any, '../utils', '/project/src/app.ts'),
      ).toBeNull();
    });

    it('should return null for absolute imports starting with /', () => {
      expect(
        plugin.resolveId!.call(
          {} as any,
          '/absolute/path',
          '/project/src/app.ts',
        ),
      ).toBeNull();
    });

    it('should delegate to resolver and return normalized path on success', () => {
      mockSync.mockReturnValue({ path: '/project/src/app/utils/index.ts' });

      const result = plugin.resolveId!.call(
        {} as any,
        '@app/utils',
        '/project/src/main.ts',
      );

      expect(mockSync).toHaveBeenCalledWith('/project/src', '@app/utils');
      expect(result).toBe('/project/src/app/utils/index.ts');
    });

    it('should return null when resolver finds no match', () => {
      mockSync.mockReturnValue({ error: 'not found' });

      const result = plugin.resolveId!.call(
        {} as any,
        '@unknown/module',
        '/project/src/main.ts',
      );

      expect(mockSync).toHaveBeenCalled();
      expect(result).toBeNull();
    });

    it('should not resolve before configResolved is called', () => {
      const uninitializedPlugin = tsconfigPathsPlugin();

      const result = uninitializedPlugin.resolveId!.call(
        {} as any,
        '@app/utils',
        '/project/src/main.ts',
      );

      expect(result).toBeNull();
      expect(mockSync).not.toHaveBeenCalled();
    });
  });
});
