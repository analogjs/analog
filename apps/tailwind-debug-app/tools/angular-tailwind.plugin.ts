import { existsSync } from 'node:fs';
import { basename, isAbsolute } from 'node:path';
import type { AnalogIntegrationPlugin } from '@analogjs/vite-plugin-angular';

export interface AngularTailwindOptions {
  /** Absolute path to the stylesheet that `@import "tailwindcss"`. */
  rootStylesheet: string;
  /** Utility prefixes that mark a stylesheet as needing `@reference`. */
  prefixes?: string[];
}

/**
 * Debug-app spike: the `tailwindCss` option of `angular()` expressed as a
 * standalone Vite plugin that reaches Angular compilation through the
 * `analog.setup()` interop hook instead of framework config.
 */
export function angularTailwind(
  options: AngularTailwindOptions,
): AnalogIntegrationPlugin {
  const root = options.rootStylesheet.replace(/\\/g, '/');
  let injected = 0;

  function inject(code: string): string | undefined {
    if (
      /(^|[;}\n\r])\s*@reference\b/m.test(code) ||
      /(^|[;}\n\r])\s*@import\s+["']tailwindcss["']/m.test(code)
    ) {
      return undefined;
    }

    const needsRef = options.prefixes
      ? options.prefixes.some((prefix) => code.includes(prefix))
      : code.includes('@apply');

    if (!needsRef) {
      return undefined;
    }

    injected++;
    return `@reference "${root}";\n${code}`;
  }

  return {
    name: 'vite-plugin-angular-tailwind',
    enforce: 'pre',

    configResolved(config) {
      if (!isAbsolute(options.rootStylesheet)) {
        throw new Error(
          `[angular-tailwind] rootStylesheet must be absolute, got "${options.rootStylesheet}"`,
        );
      }
      if (!existsSync(options.rootStylesheet)) {
        config.logger.warn(
          `[angular-tailwind] rootStylesheet not found: ${options.rootStylesheet}`,
        );
      }
      const hasTailwind = config.plugins.some((plugin) =>
        plugin.name.startsWith('@tailwindcss/vite'),
      );
      if (!hasTailwind && config.command === 'serve') {
        throw new Error(
          '[angular-tailwind] add tailwindcss() from @tailwindcss/vite to plugins',
        );
      }
    },

    // Ordinary Vite seam: stylesheets Vite serves as modules.
    transform(code, id) {
      if (!id.includes('.css')) return;
      const clean = id.split('?')[0];
      if (clean === root || code.includes(basename(root))) return;
      return inject(code);
    },

    // Analog seam: component styles Angular inlines before Vite sees them.
    analog: {
      setup(ctx) {
        ctx.registerStylePreprocessor((code) => inject(code) ?? code);
        // `@tailwindcss/vite` only sees component styles served as modules.
        ctx.externalizeComponentStyles();
      },
    },

    buildEnd() {
      this.info(
        `[angular-tailwind] injected @reference into ${injected} stylesheet(s)`,
      );
    },
  };
}
