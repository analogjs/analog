import { dirname, join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { core as PresetCore } from '@storybook/angular/dist/preset.js';
const require = createRequire(import.meta.url);
const getAbsolutePath = (input) =>
  dirname(require.resolve(join(input, 'package.json')));
export const core = async (config, options) => {
  const presetCore = PresetCore(config, options);
  return {
    ...presetCore,
    builder: {
      name: getAbsolutePath('@storybook/builder-vite'),
      options: { ...presetCore.options },
    },
  };
};
export const viteFinal = async (config, options) => {
  // Remove any loaded analogjs plugins from a vite.config.(m)ts file
  config.plugins = config.plugins
    .flat()
    .filter((plugin) => !plugin.name.includes('analogjs'));

  // Merge custom configuration into the default config
  const { mergeConfig, normalizePath } = await import('vite');
  const { default: angular } = await import('@analogjs/vite-plugin-angular');
  // @ts-ignore
  const framework = await options.presets.apply('framework');
  return mergeConfig(config, {
    // Add dependencies to pre-optimization
    optimizeDeps: {
      include: [
        '@storybook/angular/dist/client/index.js',
        '@analogjs/storybook-angular',
        '@angular/compiler',
        '@angular/platform-browser',
        '@angular/platform-browser/animations',
        'tslib',
        ...(options?.angularBuilderOptions?.experimentalZoneless
          ? []
          : ['zone.js']),
      ],
    },
    plugins: [
      angular({
        jit:
          typeof framework.options?.jit !== 'undefined'
            ? framework.options?.jit
            : true,
        liveReload:
          typeof framework.options?.liveReload !== 'undefined'
            ? framework.options?.liveReload
            : false,
        tsconfig: options?.tsConfig ?? './.storybook/tsconfig.json',
        inlineStylesExtension:
          typeof framework.options?.inlineStylesExtension !== 'undefined'
            ? framework.options?.inlineStylesExtension
            : 'css',
      }),
      angularOptionsPlugin(options, { normalizePath }),
    ],
    define: {
      STORYBOOK_ANGULAR_OPTIONS: JSON.stringify({
        experimentalZoneless:
          !!options?.angularBuilderOptions?.experimentalZoneless,
      }),
    },
  });
};

function angularOptionsPlugin(options, { normalizePath }) {
  return {
    name: 'analogjs-storybook-options-plugin',
    config() {
      const loadPaths =
        options?.angularBuilderOptions?.stylePreprocessorOptions?.loadPaths;
      const sassOptions = options?.angularBuilderOptions?.stylePreprocessorOptions?.sass;

      if (Array.isArray(loadPaths)) {
        return {
          css: {
            preprocessorOptions: {
              scss: {
                ...sassOptions,
                loadPaths: loadPaths.map(
                  (loadPath) =>
                    `${resolve(options.angularBuilderContext.workspaceRoot, loadPath)}`,
                ),
              },
            },
          },
        };
      }

      return;
    },
    transform(code, id) {
      if (
        normalizePath(id).endsWith(
          normalizePath(`${options.configDir}/preview.ts`),
        )
      ) {
        const imports = [];
        const styles = options?.angularBuilderOptions?.styles;

        if (Array.isArray(styles)) {
          styles.forEach((style) => {
            imports.push(style);
          });
        }

        const zoneless = options?.angularBuilderOptions?.experimentalZoneless;

        if (!zoneless) {
          imports.push('zone.js');
        }

        return {
          code: `
            ${imports.map((extraImport) => `import '${extraImport}';`).join('\n')}
            ${code}
          `,
        };
      }

      return;
    },
  };
}

export { addons, previewAnnotations } from '@storybook/angular/dist/preset.js';
//# sourceMappingURL=preset.js.map
