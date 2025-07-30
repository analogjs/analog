import { angular } from './lib/angular-vite-plugin.js';
export { PluginOptions } from './lib/angular-vite-plugin.js';
export { compileAnalogFile } from './lib/authoring/analog.js';
export {
  MarkdownTemplateTransform,
  defaultMarkdownTemplateTransforms,
} from './lib/authoring/markdown-transform.js';
export {
  routeTreePlugin,
  RouteTreePluginOptions,
} from './lib/route-tree-plugin.js';
export {
  jsonLdSSRPlugin,
  JsonLdSSRPluginOptions,
} from './lib/json-ld-ssr-plugin.js';

export default angular;
