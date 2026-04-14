import type { ClientDirective } from 'astro';

/**
 * Hydrate when the island receives focus
 */
const directive: ClientDirective = (load, _opts, el) => {
  el.addEventListener(
    'focusin',
    async () => {
      const hydrate = await load();
      await hydrate();
    },
    { once: true },
  );
};

export default directive;
