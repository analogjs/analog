import { platformPlugin } from './lib/platform-plugin.js';

export type {
  Options,
  PrerenderSitemapConfig,
  TypedRouterOptions,
  PrerenderContentFile,
  SitemapConfig,
  SitemapEntry,
  SitemapExcludeRule,
  SitemapPriority,
  SitemapRouteDefinition,
  SitemapRouteInput,
  SitemapRouteSource,
  SitemapTransform,
} from './lib/options.js';
export { routeGenerationPlugin } from './lib/route-generation-plugin.js';
export { tailwindPreprocessor } from './lib/tailwind-preprocessor.js';
export type {
  AngularStylePipelineContext,
  AngularStylePipelineOptions,
  AngularStylePipelinePlugin,
  StylePipelineContext,
  StylePipelineOptions,
  StylePipelinePluginEntry,
  StylePipelinePluginFactory,
  StylePipelineStylesheetRegistry,
} from './lib/style-pipeline.js';
export {
  defineAngularStylePipeline,
  defineAngularStylePipelinePlugins,
  defineStylePipeline,
  defineStylePipelinePlugins,
  resolveStylePipelinePlugins,
} from './lib/style-pipeline.js';
export type {
  StylePreprocessor,
  StylesheetDependency,
  StylesheetDiagnostic,
  StylesheetTransformContext,
  StylesheetTransformResult,
} from './lib/style-preprocessor.js';
export {
  composeStylePreprocessors,
  normalizeStylesheetDependencies,
  normalizeStylesheetTransformResult,
} from './lib/style-preprocessor.js';
export type {
  TailwindPreprocessorMode,
  TailwindPreprocessorOptions,
} from './lib/tailwind-preprocessor.js';
export default platformPlugin;
