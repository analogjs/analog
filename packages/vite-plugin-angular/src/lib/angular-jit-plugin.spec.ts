import { beforeEach, describe, expect, it, vi } from 'vitest';
import { hook } from '../testing/required.test-support.js';

vi.mock('vite', async () => {
  const actual = await vi.importActual<typeof import('vite')>('vite');
  return {
    ...actual,
    preprocessCSS: vi.fn(),
  };
});

import { preprocessCSS } from 'vite';
import { jitPlugin } from './angular-jit-plugin.js';
import { toJitInlineStyleId } from './utils/jit-inline-styles.js';

describe('jitPlugin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('soft-fails ordinary preprocessCSS errors', async () => {
    const warn = vi
      .spyOn(console, 'warn')
      .mockImplementation((message?: unknown) => message);
    vi.mocked(preprocessCSS).mockRejectedValue(new Error('boom'));

    const plugin = jitPlugin({ inlineStylesExtension: 'css' });
    Reflect.apply(hook(plugin.configResolved), {}, [{ test: { css: true } }]);

    const id = toJitInlineStyleId(
      encodeURIComponent(
        Buffer.from('.demo { color: red; }').toString('base64'),
      ),
    );

    await expect(Reflect.apply(hook(plugin.load), {}, [id])).resolves.toContain(
      'export default',
    );
    expect(warn).toHaveBeenCalled();

    warn.mockRestore();
  });

  it('applies preprocessors registered through analog.setup before preprocessCSS', async () => {
    vi.mocked(preprocessCSS).mockImplementation(async (code) => ({
      code,
      deps: new Set(),
    }));

    const plugin = jitPlugin({ inlineStylesExtension: 'css' });
    Reflect.apply(hook(plugin.configResolved), {}, [
      {
        plugins: [
          {
            name: 'vite-plugin-xyz',
            analog: {
              setup(ctx: any) {
                ctx.registerStylePreprocessor(
                  (code: string) => `${code}\n/* xyz */`,
                );
              },
            },
          },
        ],
      },
    ]);
    await (plugin.buildStart as any)?.();

    const id = toJitInlineStyleId(
      encodeURIComponent(
        Buffer.from('.demo { color: red; }').toString('base64'),
      ),
    );

    await expect(Reflect.apply(hook(plugin.load), {}, [id])).resolves.toContain(
      '.demo { color: red; }\n/* xyz */',
    );
    expect(preprocessCSS).toHaveBeenCalledWith(
      '.demo { color: red; }\n/* xyz */',
      expect.stringMatching(/\.css\?direct$/),
      expect.anything(),
    );
  });
});
