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
  StylePipelineManifest,
  StylePipelineOutput,
  StylePipelineContext,
  StylePipelineOptions,
  StylePipelinePluginEntry,
  StylePipelinePluginFactory,
} from './lib/style-pipeline.js';
export {
  defineStylePipeline,
  defineStylePipelinePlugins,
  resolveStylePipelinePlugins,
} from './lib/style-pipeline.js';
export type {
  TailwindPreprocessorMode,
  TailwindPreprocessorOptions,
} from './lib/tailwind-preprocessor.js';
export default platformPlugin;
