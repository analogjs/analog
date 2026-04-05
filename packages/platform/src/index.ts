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
export {
  defineDesignTokensConfig,
  designTokenCss,
} from './lib/design-tokens.js';
export type {
  DesignTokenFile,
  DesignTokenOutput,
  DesignTokenPlatform,
  DesignTokensConfig,
  DesignTokensOptions,
} from './lib/design-tokens.js';
export type {
  TailwindPreprocessorMode,
  TailwindPreprocessorOptions,
} from './lib/tailwind-preprocessor.js';
export default platformPlugin;
