import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('@analogjs/vite-plugin-angular', () => ({
  default: () => ({ name: 'angular-mock' }),
}));

vi.mock('@angular/core', () => ({
  enableProdMode: vi.fn(),
}));

vi.mock('vite', () => ({
  rolldownVersion: undefined,
}));

function registerMocks(rolldownVersion?: string) {
  vi.doMock('@analogjs/vite-plugin-angular', () => ({
    default: () => ({ name: 'angular-mock' }),
  }));
  vi.doMock('@angular/core', () => ({
    enableProdMode: vi.fn(),
  }));
  vi.doMock('vite', () => ({
    rolldownVersion,
  }));
}

describe('astro-angular plugin', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('should return astro configurations', async () => {
    registerMocks();
    const mod = await import('./index');

    expect(mod.default().name).toEqual('@analogjs/astro-angular');
    expect(mod.default().hooks).toStrictEqual({
      'astro:config:setup': expect.anything(),
      'astro:config:done': expect.anything(),
    });
  });

  describe('vite configuration', () => {
    it('should use esbuild config key when rolldownVersion is not available', async () => {
      registerMocks();
      const mod = await import('./index');
      const plugin = mod.default();

      let viteConfig: any;
      const mockSetup = {
        addRenderer: vi.fn(),
        updateConfig: vi.fn(function (config: any) {
          viteConfig = config.vite;
        }),
      };

      plugin.hooks['astro:config:setup'](mockSetup);

      expect(viteConfig).toHaveProperty('esbuild');
      expect(viteConfig).not.toHaveProperty('oxc');
      expect(viteConfig.esbuild.jsxDev).toBe(true);
    });

    it('should use oxc config key when rolldownVersion is available', async () => {
      registerMocks('1.0.0');
      const mod = await import('./index');
      const plugin = mod.default();

      let viteConfig: any;
      const mockSetup = {
        addRenderer: vi.fn(),
        updateConfig: vi.fn(function (config: any) {
          viteConfig = config.vite;
        }),
      };

      plugin.hooks['astro:config:setup'](mockSetup);

      expect(viteConfig).toHaveProperty('oxc');
      expect(viteConfig).not.toHaveProperty('esbuild');
      expect(viteConfig.oxc.jsx).toEqual({ development: true });
    });
  });
});
