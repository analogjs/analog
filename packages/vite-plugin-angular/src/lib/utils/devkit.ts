import { requiresLinking } from '@angular-devkit/build-angular/src/tools/babel/webpack-loader.js';
import angularApplicationPresetMaybeWithDefault from '@angular-devkit/build-angular/src/tools/babel/presets/application.js';

import { createJitResourceTransformer } from '@angular-devkit/build-angular/src/tools/esbuild/angular/jit-resource-transformer.js';
import { CompilerPluginOptions } from '@angular-devkit/build-angular/src/tools/esbuild/angular/compiler-plugin.js';
import { JavaScriptTransformer } from '@angular-devkit/build-angular/src/tools/esbuild/javascript-transformer.js';
import { SourceFileCache } from '@angular-devkit/build-angular/src/tools/esbuild/angular/compiler-plugin.js';

import { loadEsmModule } from '@angular-devkit/build-angular/src/utils/load-esm.js';

// The `application.js` module has the following at the end: `exports.default = default_1`.
// When targeting CommonJS, the import default expression is transformed into
// `__importDefault(require(...))`, and the imported value is replaced with `value.default`.
// This means it reads the named `default` property, thanks to the compiler. However, we can't
// simply do `import default from 'application.js'` in an ESM file. The reason is that the
// CommonJS module system and the ECMAScript module system have different mechanisms for
// exporting and importing modules.
const angularApplicationPreset =
  // For ESM.
  (angularApplicationPresetMaybeWithDefault as any).default ||
  // For CommonJS.
  angularApplicationPresetMaybeWithDefault;

export {
  requiresLinking,
  loadEsmModule,
  angularApplicationPreset,
  createJitResourceTransformer,
  CompilerPluginOptions,
  JavaScriptTransformer,
  SourceFileCache,
};
