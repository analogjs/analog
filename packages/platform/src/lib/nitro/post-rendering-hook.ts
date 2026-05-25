import type { Nitro, PrerenderRoute } from 'nitro/types';

export function addPostRenderingHooks(
  nitro: Nitro,
  hooks: ((pr: PrerenderRoute) => Promise<void> | void)[],
): void {
  for (const hook of hooks) {
    nitro.hooks.hook('prerender:generate', async (route: PrerenderRoute) => {
      await hook(route);
    });
  }
}
