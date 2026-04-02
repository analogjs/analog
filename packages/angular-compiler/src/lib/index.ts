export { compile, type CompileResult, type CompileOptions } from './compile.js';
export {
  scanFile,
  type RegistryEntry,
  type ComponentRegistry,
} from './registry.js';
export { jitTransform, type JitTransformResult } from './jit-transform.js';
export { inlineResourceUrls, extractInlineStyles } from './resource-inliner.js';
