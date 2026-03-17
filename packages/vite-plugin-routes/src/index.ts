import { jsonLdManifest } from './lib/json-ld-manifest-plugin.js';
import { typedRoutes } from './lib/typed-routes-plugin.js';

export type { JsonLdManifestPluginOptions } from './lib/json-ld-manifest-plugin.js';
export {
  detectJsonLdModuleExports,
  extractMarkdownJsonLd,
  generateJsonLdManifestSource,
} from './lib/json-ld-manifest-plugin.js';
export type { TypedRoutesPluginOptions } from './lib/typed-routes-plugin.js';
export default typedRoutes;
export { jsonLdManifest, typedRoutes };
