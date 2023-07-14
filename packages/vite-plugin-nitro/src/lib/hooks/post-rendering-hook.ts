import { Nitro, PrerenderRoute } from 'nitropack';

export function runPostRenderingHooks(
  nitro: Nitro,
  hooks: ((pr: PrerenderRoute) => Promise<boolean>)[]
): void {
  hooks.forEach((hook: (preRoute: PrerenderRoute) => void) => {
    nitro.hooks.hook('prerender:generate', async (route: PrerenderRoute) => {
      hook(route);
      await Promise.resolve(true);
    });
  });
}
