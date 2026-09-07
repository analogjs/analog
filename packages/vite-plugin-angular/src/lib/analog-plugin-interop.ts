import type { Plugin, ResolvedConfig } from 'vite';
import {
  composeStylePreprocessors,
  type StylePreprocessor,
  type StylesheetRegistryReader,
} from './style-preprocessor.js';
import type { RegistryEntry } from './compiler/registry.js';
import { debugStylePipeline } from './utils/debug.js';

import type {
  TransformFilter,
  ComponentRegistryEntries,
  StylesheetRegistryContext,
  StylesheetRegistryConfigurator,
  AnalogPluginContext,
  AnalogPluginHooks,
  AnalogIntegrationPlugin,
} from './analog-plugin-types.js';
export type {
  TransformFilter,
  ComponentRegistryEntries,
  StylesheetRegistryContext,
  StylesheetRegistryConfigurator,
  AnalogPluginContext,
  AnalogPluginHooks,
  AnalogIntegrationPlugin,
} from './analog-plugin-types.js';

export interface AnalogIntegrations {
  stylePreprocessor: StylePreprocessor | undefined;
  configureStylesheetRegistry: StylesheetRegistryConfigurator | undefined;
  transformFilter: TransformFilter | undefined;
  componentRegistries: ComponentRegistryEntries[];
  include: string[];
  externalizeStyles: boolean;
}

const integrationsByConfig = new WeakMap<
  ResolvedConfig,
  Promise<AnalogIntegrations>
>();

/**
 * Runs every `analog.setup()` hook found in the resolved Vite plugin list,
 * once per resolved config, and composes the registrations in plugin order.
 */
export function discoverAnalogIntegrations(
  config: ResolvedConfig,
): Promise<AnalogIntegrations> {
  let pending = integrationsByConfig.get(config);
  if (!pending) {
    pending = runAnalogSetupHooks(config.plugins ?? []);
    integrationsByConfig.set(config, pending);
  }
  return pending;
}

export async function runAnalogSetupHooks(
  plugins: readonly Plugin[],
): Promise<AnalogIntegrations> {
  const preprocessors: StylePreprocessor[] = [];
  const registryConfigurators: StylesheetRegistryConfigurator[] = [];
  const transformFilters: TransformFilter[] = [];
  const componentRegistries: ComponentRegistryEntries[] = [];
  const include: string[] = [];
  // Tailwind's Vite transform does not run inside preprocessCSS.
  let externalizeStyles = plugins.some((plugin) =>
    plugin.name.startsWith('@tailwindcss/vite:'),
  );

  for (const plugin of plugins as readonly AnalogIntegrationPlugin[]) {
    if (typeof plugin.analog?.setup !== 'function') {
      continue;
    }

    const registeredBefore = preprocessors.length;
    const context: AnalogPluginContext = {
      registerStylePreprocessor(preprocessor) {
        preprocessors.push(wrapStylePreprocessor(plugin.name, preprocessor));
      },
      externalizeComponentStyles() {
        externalizeStyles = true;
      },
      configureStylesheetRegistry(configure) {
        registryConfigurators.push(
          wrapRegistryConfigurator(plugin.name, configure),
        );
      },
      registerTransformFilter(filter) {
        transformFilters.push(filter);
      },
      registerComponentRegistry(entries) {
        componentRegistries.push(entries);
      },
      addInclude(globs) {
        include.push(...globs);
      },
    };

    try {
      await plugin.analog.setup(context);
    } catch (error) {
      throw new Error(
        `[analog] analog.setup() from plugin "${plugin.name}" failed: ${describeError(error)}`,
        { cause: error },
      );
    }

    debugStylePipeline('analog.setup() completed', {
      plugin: plugin.name,
      stylePreprocessors: preprocessors.length - registeredBefore,
      registryConfigurators: registryConfigurators.length,
      transformFilters: transformFilters.length,
      componentRegistries: componentRegistries.length,
      include: include.length,
      externalizeStyles,
    });
  }

  return {
    stylePreprocessor: composeStylePreprocessors(preprocessors),
    configureStylesheetRegistry: registryConfigurators.length
      ? (registry, context) => {
          for (const configure of registryConfigurators) {
            configure(registry, context);
          }
        }
      : undefined,
    transformFilter: transformFilters.length
      ? (code, id) => transformFilters.every((filter) => filter(code, id))
      : undefined,
    componentRegistries,
    include,
    externalizeStyles,
  };
}

function wrapStylePreprocessor(
  pluginName: string,
  preprocessor: StylePreprocessor,
): StylePreprocessor {
  return (code, filename, context) => {
    try {
      return preprocessor(code, filename, context);
    } catch (error) {
      throw new Error(
        `[analog] Style preprocessor from plugin "${pluginName}" failed for "${filename}": ${describeError(error)}`,
        { cause: error },
      );
    }
  };
}

function wrapRegistryConfigurator(
  pluginName: string,
  configure: StylesheetRegistryConfigurator,
): StylesheetRegistryConfigurator {
  return (registry, context) => {
    try {
      configure(registry, context);
    } catch (error) {
      throw new Error(
        `[analog] Stylesheet registry configurator from plugin "${pluginName}" failed: ${describeError(error)}`,
        { cause: error },
      );
    }
  };
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
