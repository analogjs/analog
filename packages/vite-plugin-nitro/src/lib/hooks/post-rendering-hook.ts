import { Nitro, PrerenderRoute } from 'nitropack';

export function addPostRenderingHooks(
  nitro: Nitro,
  hooks: ((pr: PrerenderRoute) => Promise<void>)[]
): void {
  hooks.forEach((hook: (preRoute: PrerenderRoute) => void) => {
    nitro.hooks.hook('prerender:generate', (route: PrerenderRoute) => {
      hook(route);
    });
  });
}
