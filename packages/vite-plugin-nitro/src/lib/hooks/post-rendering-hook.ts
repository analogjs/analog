import { Nitro, PrerenderRoute } from 'nitropack';

export function addPostRenderingHooks(
  nitro: Nitro,
  hooks: ((pr: PrerenderRoute) => Promise<void>)[],
): void {
  hooks.forEach((hook) => {
    nitro.hooks.hook('prerender:generate', hook);
  });
}
