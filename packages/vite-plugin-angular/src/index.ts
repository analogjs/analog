import { angular } from './lib/angular-vite-plugin.js';
export { angular } from './lib/angular-vite-plugin.js';
export type { PluginOptions } from './lib/angular-vite-plugin.js';
export type {
  AnalogIntegrationPlugin,
  AnalogPluginContext,
  AnalogPluginHooks,
  ComponentRegistryEntries,
  StylesheetRegistryConfigurator,
  StylesheetRegistryContext,
  TransformFilter,
} from './lib/analog-plugin-interop.js';
export type {
  RegistryEntry as ComponentRegistryEntry,
  RegistryInput as ComponentRegistryInput,
} from './lib/compiler/registry.js';
export type {
  StylePreprocessor,
  StylesheetDependency,
  StylesheetDiagnostic,
  StylesheetRegistryReader,
  StylesheetTransformContext,
  StylesheetTransformResult,
} from './lib/style-preprocessor.js';

export default angular;
