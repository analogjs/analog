import { angular } from './lib/angular-vite-plugin.js';
export type { PluginOptions } from './lib/angular-vite-plugin.js';
export type {
  StylePreprocessor,
  StylesheetDependency,
  StylesheetDiagnostic,
  StylesheetTransformResult,
  StylesheetTransformContext,
} from './lib/style-preprocessor.js';
export {
  composeStylePreprocessors,
  normalizeStylesheetTransformResult,
} from './lib/style-preprocessor.js';
export type {
  AngularStylePipelineContext,
  AngularStylePipelineOptions,
  AngularStylePipelinePlugin,
} from './lib/style-pipeline.js';
export {
  defineAngularStylePipeline,
  defineAngularStylePipelinePlugins,
} from './lib/style-pipeline.js';

export default angular;
