import type { Plugin, ResolvedConfig } from 'vite';
import {
  composeStylePreprocessors,
  type StylePreprocessor,
} from './style-preprocessor.js';
import { debugStylePipeline } from './utils/debug.js';

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
      externalizeStyles,
    });
  }

  return {
    stylePreprocessor: composeStylePreprocessors(preprocessors),
    externalizeStyles,
  };
}

/**
 * Resolves what a compilation path needs from the discovered integrations:
 * the stylesheet preprocessor chain (plugin-registered preprocessors first,
 * then the chain configured through `angular()` options) and whether any
 * plugin asked for externalized component styles.
 */
export async function resolveAnalogIntegrations(
  config: ResolvedConfig,
  configured?: StylePreprocessor,
): Promise<AnalogIntegrations> {
  const integrations = await discoverAnalogIntegrations(config);
  return {
    stylePreprocessor: composeStylePreprocessors([
      integrations.stylePreprocessor,
      configured,
    ]),
    externalizeStyles: integrations.externalizeStyles,
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

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
