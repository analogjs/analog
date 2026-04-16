export { compile, type CompileResult, type CompileOptions } from './compile.js';
export {
  scanFile,
  type RegistryEntry,
  type ComponentRegistry,
} from './registry.js';
export {
  scanDtsFile,
  scanPackageDts,
  collectImportedPackages,
  collectRelativeReExports,
} from './dts-reader.js';
export { jitTransform, type JitTransformResult } from './jit-transform.js';
export { generateHmrCode } from './hmr.js';
export { inlineResourceUrls, extractInlineStyles } from './resource-inliner.js';
export {
  debugCompile,
  debugRegistry,
  debugResolve,
  debugEmit,
} from './debug.js';
