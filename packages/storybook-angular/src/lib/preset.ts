import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { core as PresetCore } from '@storybook/angular/preset';
import { fileURLToPath } from 'node:url';
import * as vite from 'vite';
import type { Plugin, UserConfig } from 'vite';
import angular from '@analogjs/vite-plugin-angular';

export const previewAnnotations = async (
  entries: string[] = [],
  options: any,
): Promise<string[]> => {
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

export const core = async (config: any, options: any): Promise<any> => {
  const presetCore = await PresetCore(config, options);
  return {
    ...presetCore,
    builder: {
      name: import.meta.resolve('@storybook/builder-vite'),
      options: { ...presetCore.options },
    },
  };
};

async function resolveExperimentalZoneless(
  frameworkOptions: any,
  angularBuilderOptions: any,
) {
  // 1. Explicit framework option (user's .storybook/main.ts)
  if (typeof frameworkOptions?.experimentalZoneless === 'boolean') {
    return frameworkOptions.experimentalZoneless;
  }

  // 2. Angular builder options (set by start-storybook/build-storybook)
  if (typeof angularBuilderOptions?.experimentalZoneless === 'boolean') {
    return angularBuilderOptions.experimentalZoneless;
  }

  // 3. Auto-detect Angular 21+ (matches @storybook/angular builder behavior)
  try {
    const { VERSION } = await import('@angular/core');
    return !!(VERSION.major && Number(VERSION.major) >= 21);
  } catch {
    return false;
  }
}

export const viteFinal = async (config: any, options: any): Promise<any> => {
  // Remove any loaded analogjs plugins from a vite.config.(m)ts file
  config.plugins = (config.plugins ?? [])
    .flat()
    .filter((plugin: any) => !plugin.name.includes('analogjs'));

  // @ts-ignore
  const framework = await options.presets.apply('framework');
  const experimentalZoneless = await resolveExperimentalZoneless(
    framework.options,
    options?.angularBuilderOptions,
  );
  return vite.mergeConfig(config, {
    // Add dependencies to pre-optimization
    optimizeDeps: {
      include: [
        '@storybook/angular/client',
        '@analogjs/storybook-angular',
        '@angular/compiler',
        '@angular/platform-browser',
        '@angular/platform-browser/animations',
        'tslib',
        ...(experimentalZoneless ? [] : ['zone.js']),
      ],
    },
    resolve: {
      alias: {
        '@storybook/globalThis': '@storybook/global',
      },
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
      angularOptionsPlugin(options, {
        normalizePath: vite.normalizePath,
        experimentalZoneless,
      }),
      storybookTransformConfigPlugin(),
    ],
    define: {
      STORYBOOK_ANGULAR_OPTIONS: JSON.stringify({
        experimentalZoneless: !!experimentalZoneless,
      }),
    },
  });
};

function angularOptionsPlugin(
  options: any,
  {
    normalizePath,
    experimentalZoneless,
  }: { normalizePath: (path: string) => string; experimentalZoneless: boolean },
): Plugin {
  let resolvedConfig: UserConfig | undefined;
  return {
    name: 'analogjs-storybook-options-plugin',
    config(userConfig: UserConfig) {
      resolvedConfig = userConfig;
      const loadPaths =
        options?.angularBuilderOptions?.stylePreprocessorOptions?.loadPaths;
      const sassOptions =
        options?.angularBuilderOptions?.stylePreprocessorOptions?.sass;

      if (Array.isArray(loadPaths)) {
        const workspaceRoot =
          options.angularBuilderContext?.workspaceRoot ??
          userConfig?.root ??
          process.cwd();
        return {
          css: {
            preprocessorOptions: {
              scss: {
                ...sassOptions,
                loadPaths: loadPaths.map(
                  (loadPath) => `${resolve(workspaceRoot, loadPath)}`,
                ),
              },
            },
          },
        };
      }

      return;
    },
    async transform(code: string, id: string) {
      if (
        normalizePath(id).endsWith(
          normalizePath(`${options.configDir}/preview.ts`),
        )
      ) {
        const imports = [];
        const styles = options?.angularBuilderOptions?.styles;
        const workspaceRoot =
          options?.angularBuilderContext?.workspaceRoot ?? process.cwd();

        if (Array.isArray(styles)) {
          styles.forEach((style) => {
            imports.push(style);
          });
        }

        if (!experimentalZoneless) {
          imports.push('zone.js');
        }

        // Use vite config root when angularBuilderContext is not available
        // (e.g., when running via Vitest instead of Angular builders)
        const projectRoot = resolvedConfig?.root ?? process.cwd();

        return {
          code: `
            ${imports
              .map((extraImport) => {
                const resolvedProjectImport = resolve(projectRoot, extraImport);
                const resolvedWorkspaceImport = resolve(
                  workspaceRoot,
                  extraImport,
                );

                if (
                  extraImport.startsWith('.') ||
                  extraImport.startsWith('src') ||
                  existsSync(resolvedProjectImport)
                ) {
                  // relative to root
                  return `import '${resolvedProjectImport}';`;
                }

                if (existsSync(resolvedWorkspaceImport)) {
                  return `import '${resolvedWorkspaceImport}';`;
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

function storybookTransformConfigPlugin(): Plugin {
  const configKey = vite.rolldownVersion ? 'oxc' : 'esbuild';

  return {
    name: 'analogjs-storybook-transform-config',
    apply: 'build',
    config() {
      return {
        [configKey]: {
          // Don't mangle class names during the build
          // This fixes display of compodoc argtypes
          keepNames: true,
        },
      };
    },
  };
}

export { addons } from '@storybook/angular/preset';
