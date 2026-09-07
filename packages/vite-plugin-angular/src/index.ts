import { angular as createAngularPlugins } from './lib/angular-vite-plugin.js';
import type { Plugin } from 'vite';
import type { PluginOptions } from './lib/plugin-options.js';
export type { PluginOptions } from './lib/plugin-options.js';
export type {
  AnalogIntegrationPlugin,
  AnalogPluginContext,
  AnalogPluginHooks,
  ComponentRegistryEntries,
  StylesheetRegistryConfigurator,
  StylesheetRegistryContext,
  TransformFilter,
} from './lib/analog-plugin-types.js';
export type {
  RegistryEntry as ComponentRegistryEntry,
  RegistryInput as ComponentRegistryInput,
} from './lib/compiler/registry-types.js';
export type {
  StylePreprocessor,
  StylesheetDependency,
  StylesheetDiagnostic,
  StylesheetRegistryReader,
  StylesheetTransformContext,
  StylesheetTransformResult,
} from './lib/style-preprocessor.js';

export function angular(options?: PluginOptions): Plugin[] {
  return createAngularPlugins(options);
}

export default angular;
