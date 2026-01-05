import { resolve } from 'node:path';
import { core as PresetCore } from '@storybook/angular/preset';
import { fileURLToPath } from 'node:url';

export const previewAnnotations = async (entries = [], options) => {
  const config = fileURLToPath(
    import.meta.resolve('@storybook/angular/client/config'),
  );
  const annotations = [...entries, config];

  if (options.enableProdMode) {
    const previewProdPath = fileURLToPath(
      import.meta.resolve('@storybook/angular/client/preview-prod'),
    );
    annotations.unshift(previewProdPath);
  }

  const docsConfig = await options.presets.apply('docs', {}, options);
  const docsEnabled = Object.keys(docsConfig).length > 0;
  if (docsEnabled) {
    const docsConfigPath = fileURLToPath(
      import.meta.resolve('@storybook/angular/client/docs/config'),
    );
    annotations.push(docsConfigPath);
  }
  return annotations;
};

export const core = async (config, options) => {
  const presetCore = PresetCore(config, options);
  return {
    ...presetCore,
    builder: {
      name: import.meta.resolve('@storybook/builder-vite'),
      options: { ...presetCore.options },
    },
  };
};
export const viteFinal = async (config, options) => {
  // Remove any loaded analogjs plugins from a vite.config.(m)ts file
  config.plugins = (config.plugins ?? [])
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
        '@storybook/angular/client',
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
        tsconfig:
          typeof framework.options?.tsconfig !== 'undefined'
            ? framework.options?.tsconfig
            : (options?.tsConfig ?? './.storybook/tsconfig.json'),
        inlineStylesExtension:
          typeof framework.options?.inlineStylesExtension !== 'undefined'
            ? framework.options?.inlineStylesExtension
            : 'css',
      }),
      angularOptionsPlugin(options, { normalizePath }),
      storybookEsbuildPlugin(),
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
      const sassOptions =
        options?.angularBuilderOptions?.stylePreprocessorOptions?.sass;

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
    async transform(code, id) {
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

        const projectConfig =
          await options.angularBuilderContext.getProjectMetadata(
            options.angularBuilderContext.target.project,
          );

        return {
          code: `
            ${imports
              .map((extraImport) => {
                if (
                  extraImport.startsWith('.') ||
                  extraImport.startsWith('src')
                ) {
                  // relative to root
                  return `import '${resolve(options.angularBuilderContext.workspaceRoot, projectConfig.root, extraImport)}';`;
                }

                // absolute import
                return `import '${extraImport}';`;
              })
              .join('\n')}
            ${code}
          `,
        };
      }

      return;
    },
  };
}

function storybookEsbuildPlugin() {
  return {
    name: 'analogjs-storybook-esbuild-config',
    apply: 'build',
    config() {
      return {
        esbuild: {
          // Don't mangle class names during the build
          // This fixes display of compodoc argtypes
          keepNames: true,
        },
      };
    },
  };
}

export { addons } from '@storybook/angular/preset';
//# sourceMappingURL=preset.js.map
