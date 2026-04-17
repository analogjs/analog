import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('vite', async () => {
  const actual = await vi.importActual<typeof import('vite')>('vite');
  return {
    ...actual,
    preprocessCSS: vi.fn(),
  };
});

import { preprocessCSS } from 'vite';
import { jitPlugin } from './angular-jit-plugin.js';
import { TailwindReferenceError } from './utils/tailwind-reference.js';

describe('jitPlugin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rethrows TailwindReferenceError from preprocessCSS', async () => {
    vi.mocked(preprocessCSS).mockRejectedValue(
      new TailwindReferenceError('comment-masked @reference'),
    );

    const plugin = jitPlugin({ inlineStylesExtension: 'css' });
    plugin.configResolved?.({ test: { css: true } } as any);

    const encoded = encodeURIComponent(
      Buffer.from('.demo { color: red; }').toString('base64'),
    );

    await expect(
      plugin.load?.(`virtual:angular:jit:style:inline;${encoded}`),
    ).rejects.toThrow('comment-masked @reference');
  });

  it('soft-fails ordinary preprocessCSS errors', async () => {
    const warn = vi
      .spyOn(console, 'warn')
      .mockImplementation((message?: unknown) => message);
    vi.mocked(preprocessCSS).mockRejectedValue(new Error('boom'));

    const plugin = jitPlugin({ inlineStylesExtension: 'css' });
    plugin.configResolved?.({ test: { css: true } } as any);

    const encoded = encodeURIComponent(
      Buffer.from('.demo { color: red; }').toString('base64'),
    );

    await expect(
      plugin.load?.(`virtual:angular:jit:style:inline;${encoded}`),
    ).resolves.toContain('export default');
    expect(warn).toHaveBeenCalled();

    warn.mockRestore();
  });
});
