import { describe, expect } from 'vitest';
import { platformPlugin } from './platform-plugin.js';

vi.mock('@analogjs/vite-plugin-angular', () => ({
  default: vi.fn(() => []),
}));
vi.mock('@analogjs/vite-plugin-nitro');
vi.mock('./ssr/ssr-build-plugin');
vi.mock('./ssr/dev-server-plugin');

describe('platformPlugin', () => {
  const setup = async () => {
    const viteNitroPluginImport = await import('@analogjs/vite-plugin-nitro');
    const viteNitroPluginSpy = vi.fn(() => []);
    viteNitroPluginImport.default = viteNitroPluginSpy;

    const ssrBuildPluginImport = await import('./ssr/ssr-build-plugin');
    const ssrBuildPluginSpy = vi.fn();
    ssrBuildPluginImport.ssrBuildPlugin = ssrBuildPluginSpy;

    return {
      viteNitroPluginSpy,
      ssrBuildPluginSpy,
      platformPlugin,
    };
  };

  it('should default ssr to true and pass that value to other plugins if no ssr value provided in options', async () => {
    const { viteNitroPluginSpy, ssrBuildPluginSpy, platformPlugin } =
      await setup();
    platformPlugin();

    expect(viteNitroPluginSpy).toHaveBeenCalledWith({ ssr: true }, undefined);
    expect(ssrBuildPluginSpy).toHaveBeenCalled();
  });

  it('should pass ssr value as true if options.ssr is set to true', async () => {
    const { viteNitroPluginSpy, ssrBuildPluginSpy, platformPlugin } =
      await setup();
    platformPlugin({ ssr: true });

    expect(viteNitroPluginSpy).toHaveBeenCalledWith({ ssr: true }, undefined);
    expect(ssrBuildPluginSpy).toHaveBeenCalled();
  });

  it('should pass ssr value as false if options.ssr is set to false', async () => {
    const { viteNitroPluginSpy, ssrBuildPluginSpy, platformPlugin } =
      await setup();
    platformPlugin({ ssr: false });

    expect(viteNitroPluginSpy).toHaveBeenCalledWith({ ssr: false }, undefined);
    expect(ssrBuildPluginSpy).not.toHaveBeenCalled();
  });

  it('should forward experimental.useAngularCompilationAPI to the Angular vite plugin', async () => {
    const angularPluginImport = await import('@analogjs/vite-plugin-angular');

    platformPlugin({
      experimental: {
        useAngularCompilationAPI: true,
      },
    });

    expect(angularPluginImport.default).toHaveBeenCalledWith(
      expect.objectContaining({
        experimental: {
          useAngularCompilationAPI: true,
        },
      }),
    );
  });
});
