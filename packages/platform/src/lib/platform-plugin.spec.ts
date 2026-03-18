import { describe, expect } from 'vitest';
import { platformPlugin } from './platform-plugin.js';

const { viteNitroPluginSpy, angularSpy, ssrBuildPluginSpy } = vi.hoisted(
  () => ({
    viteNitroPluginSpy: vi.fn(() => []),
    angularSpy: vi.fn(() => []),
    ssrBuildPluginSpy: vi.fn(() => []),
  }),
);

vi.mock('@analogjs/vite-plugin-nitro', () => ({
  default: viteNitroPluginSpy,
}));
vi.mock('@analogjs/vite-plugin-angular', () => ({ default: angularSpy }));
vi.mock('./ssr/ssr-build-plugin', () => ({
  ssrBuildPlugin: ssrBuildPluginSpy,
}));
vi.mock('./ssr/dev-server-plugin');

describe('platformPlugin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should default ssr to true and pass that value to other plugins if no ssr value provided in options', () => {
    platformPlugin();

    expect(viteNitroPluginSpy).toHaveBeenCalledWith({ ssr: true }, undefined);
    expect(ssrBuildPluginSpy).toHaveBeenCalled();
  });

  it('should pass ssr value as true if options.ssr is set to true', () => {
    platformPlugin({ ssr: true });

    expect(viteNitroPluginSpy).toHaveBeenCalledWith({ ssr: true }, undefined);
    expect(ssrBuildPluginSpy).toHaveBeenCalled();
  });

  it('should pass ssr value as false if options.ssr is set to false', () => {
    platformPlugin({ ssr: false });

    expect(viteNitroPluginSpy).toHaveBeenCalledWith({ ssr: false }, undefined);
    expect(ssrBuildPluginSpy).not.toHaveBeenCalled();
  });
});
