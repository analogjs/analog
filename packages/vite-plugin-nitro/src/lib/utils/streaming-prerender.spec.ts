import { describe, expect, it, vi } from 'vitest';
import { createSsrStreamRenderer, ssrStreamRenderer } from './renderers';

const state = vi.hoisted(() => ({
  init: undefined as
    | ((renderer: { options: { virtual: Record<string, string> } }) => void)
    | undefined,
  virtual: {} as Record<string, string>,
  close: vi.fn(),
}));

vi.mock('nitropack', () => ({
  createNitro: async () => ({
    hooks: {
      hook(name: string, callback: typeof state.init) {
        expect(name).toBe('prerender:init');
        state.init = callback;
      },
    },
    close: state.close,
  }),
  prepare: vi.fn(),
  copyPublicAssets: vi.fn(),
  prerender: async () => {
    const renderer = { options: { virtual: state.virtual } };
    state.init?.(renderer);
    state.virtual = renderer.options.virtual;
  },
}));

import { buildServer } from '../build-server';

describe('streaming prerender policy', () => {
  it('forces buffered static HTML without changing the request-time renderer', async () => {
    const virtual = {
      '#ANALOG_SSR_RENDERER': ssrStreamRenderer,
      '#custom': 'export default 1;',
    };
    state.virtual = virtual;
    await buildServer(
      { ssr: true, static: true, experimental: { streaming: true } },
      { virtual, prerender: { routes: ['/'] } },
    );
    expect(state.virtual['#ANALOG_SSR_RENDERER']).toBe(
      createSsrStreamRenderer(true),
    );
    expect(state.virtual['#custom']).toBe(virtual['#custom']);
    expect(virtual['#ANALOG_SSR_RENDERER']).toBe(ssrStreamRenderer);
    expect(state.close).toHaveBeenCalledOnce();
  });
});
