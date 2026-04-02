export {
  compile,
  type CompileResult,
  type CompileOptions,
} from './lib/compile.js';
export {
  scanFile,
  type RegistryEntry,
  type ComponentRegistry,
} from './lib/registry.js';
export { jitTransform, type JitTransformResult } from './lib/jit-transform.js';
export {
  inlineResourceUrls,
  extractInlineStyles,
} from './lib/resource-inliner.js';
