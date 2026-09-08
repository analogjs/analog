import type { Plugin } from 'vite';

function handler<H extends (...args: never[]) => unknown>(
  hook: H | { handler: H } | undefined,
): H | undefined {
  return typeof hook === 'function' ? hook : hook?.handler;
}

/** Vite can configure a replacement server before closing its predecessor. */
export function restartablePlugins(create: () => Plugin[]): Plugin[] {
  let current = create();
  let configured = false;
  return [
    {
      name: '@analogjs/compiler-configuration',
      enforce: 'pre',
      config() {
        if (configured) current = create();
        configured = true;
      },
    },
    ...current.map((initial, index): Plugin => {
      const selected = () => {
        const plugin = current[index];
        if (!plugin || plugin.name !== initial.name)
          throw new Error('Angular plugin configuration changed its shape');
        return plugin;
      };
      return {
        ...initial,
        config(config, env) {
          return handler(selected().config)?.call(this, config, env);
        },
        configResolved(config) {
          return handler(selected().configResolved)?.call(this, config);
        },
        configureServer(server) {
          return handler(selected().configureServer)?.call(this, server);
        },
        async applyToEnvironment(environment) {
          const plugin = selected();
          // Freeze runtime hooks to this configuration. Old close hooks must
          // retain their own compilers, caches, stylesheets and middleware.
          const applied = await plugin.applyToEnvironment?.call(
            this,
            environment,
          );
          return applied === true || applied === undefined ? plugin : applied;
        },
      };
    }),
  ];
}
