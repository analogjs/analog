import { describe, expect } from 'vitest';
import { platformPlugin } from './platform-plugin';

vi.mock('./vite-nitro-plugin');
vi.mock('./ssr/ssr-build-plugin');
vi.mock('./ssr/dev-server-plugin');

describe('platformPlugin', () => {
  const setup = async () => {
    const viteNitroPluginImport = await import('./vite-nitro-plugin');
    const viteNitroPluginSpy = vi.fn();
    viteNitroPluginImport.viteNitroPlugin = viteNitroPluginSpy;

    const ssrBuildPluginImport = await import('./ssr/ssr-build-plugin');
    const ssrBuildPluginSpy = vi.fn();
    ssrBuildPluginImport.ssrBuildPlugin = ssrBuildPluginSpy;

    const devServerPluginImport = await import('./ssr/dev-server-plugin');
    const devServerPluginSpy = vi.fn();
    devServerPluginImport.devServerPlugin = devServerPluginSpy;

    return {
      viteNitroPluginSpy,
      ssrBuildPluginSpy,
      devServerPluginSpy,
      platformPlugin,
    };
  };

  it('should default ssr to true and pass that value to other plugins if no ssr value provided in options', async () => {
    const {
      viteNitroPluginSpy,
      ssrBuildPluginSpy,
      devServerPluginSpy,
      platformPlugin,
    } = await setup();
    platformPlugin();

    expect(viteNitroPluginSpy).toHaveBeenCalledWith({ ssr: true }, undefined);
    expect(ssrBuildPluginSpy).toHaveBeenCalled();
    expect(devServerPluginSpy).toHaveBeenCalled();
  });

  it('should pass ssr value as true if options.ssr is set to true', async () => {
    const {
      viteNitroPluginSpy,
      ssrBuildPluginSpy,
      devServerPluginSpy,
      platformPlugin,
    } = await setup();
    platformPlugin({ ssr: true });

    expect(viteNitroPluginSpy).toHaveBeenCalledWith({ ssr: true }, undefined);
    expect(ssrBuildPluginSpy).toHaveBeenCalled();
    expect(devServerPluginSpy).toHaveBeenCalled();
  });

  it('should pass ssr value as false if options.ssr is set to false', async () => {
    const {
      viteNitroPluginSpy,
      ssrBuildPluginSpy,
      devServerPluginSpy,
      platformPlugin,
    } = await setup();
    platformPlugin({ ssr: false });

    expect(viteNitroPluginSpy).toHaveBeenCalledWith({ ssr: false }, undefined);
    expect(ssrBuildPluginSpy).not.toHaveBeenCalled();
    expect(devServerPluginSpy).not.toHaveBeenCalled();
  });

  it('should pass the custom endpoint as part of the nitro runtimeConfig if options.apiPrefix is set to false', async () => {
    const customPrefix = 'custom-endpoint';
    const { viteNitroPluginSpy, platformPlugin } = await setup();
    platformPlugin({ apiPrefix: customPrefix });

    expect(viteNitroPluginSpy).toHaveBeenCalledWith(expect.anything(), {
      runtimeConfig: {
        apiPrefix: customPrefix,
      },
    });
  });
});
