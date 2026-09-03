import type { Plugin, ResolvedConfig } from 'vite';
import {
  composeStylePreprocessors,
  type StylePreprocessor,
  type StylesheetRegistryReader,
} from './style-preprocessor.js';
import type { RegistryEntry } from './compiler/registry.js';
import { debugStylePipeline } from './utils/debug.js';

export type TransformFilter = (code: string, id: string) => boolean;

export type ComponentRegistryEntries = ReadonlyMap<string, RegistryEntry>;

export interface StylesheetRegistryContext {
  workspaceRoot: string;
}

export type StylesheetRegistryConfigurator = (
  registry: StylesheetRegistryReader,
  context: StylesheetRegistryContext,
) => void;

/**
 * Narrow framework context handed to a Vite plugin's `analog.setup()` hook.
 * Only grows when a concrete integration needs another seam.
 */
export interface AnalogPluginContext {
  /**
   * Registers a pre-transform that runs on every Angular component stylesheet
   * before it enters Vite's `preprocessCSS` pipeline.
   */
  registerStylePreprocessor(preprocessor: StylePreprocessor): void;
  /**
   * Requests that component styles are externalized in dev and watch mode so
   * they run through Vite's CSS plugin pipeline (for example
   * `@tailwindcss/vite`) instead of being inlined through `preprocessCSS`,
   * which only runs PostCSS and CSS preprocessors. Production builds keep
   * inlining component styles.
   */
  externalizeComponentStyles(): void;
  /**
   * Receives the live stylesheet registry for externalized component styles
   * each time a compilation creates one, so the plugin can map component
   * stylesheet sources to their served ids, dependencies, and diagnostics.
   */
  configureStylesheetRegistry(configure: StylesheetRegistryConfigurator): void;
  /**
   * Restricts which modules Angular compiles. A module is transformed only
   * when every registered filter returns `true` for it.
   */
  registerTransformFilter(filter: TransformFilter): void;
  /**
   * Contributes directive, component, pipe, and NgModule metadata keyed by
   * class name for classes the fast compiler cannot reach through its own
   * tsconfig-driven scan (for example components compiled from another
   * source format). The map is read on every compile, so a plugin may keep
   * filling it after setup.
   */
  registerComponentRegistry(entries: ComponentRegistryEntries): void;
  /**
   * Adds TypeScript include globs to the Angular compilation. Globs resolve
   * against the same workspace root as `angular({ include })`, so a leading
   * `/` means workspace-relative.
   */
  addInclude(globs: string[]): void;
}

export interface AnalogPluginHooks {
  setup?(context: AnalogPluginContext): void | Promise<void>;
}

/**
 * A normal Vite plugin that optionally exposes an `analog` setup hook.
 * Discovery is structural (`plugin.analog?.setup`), so this type is a DX aid
 * rather than a requirement.
 */
export type AnalogIntegrationPlugin = Plugin & { analog?: AnalogPluginHooks };

export interface AnalogIntegrations {
  stylePreprocessor?: StylePreprocessor;
  configureStylesheetRegistry?: StylesheetRegistryConfigurator;
  transformFilter?: TransformFilter;
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
  let externalizeStyles = false;

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
      );
    }
  };
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
