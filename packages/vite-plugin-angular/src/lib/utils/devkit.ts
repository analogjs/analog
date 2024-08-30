import { VERSION } from '@angular/compiler-cli';
import { createRequire } from 'node:module';
import type { CompilerPluginOptions } from './compiler-plugin-options.js';
import * as sfc from './source-file-cache.js';

const require = createRequire(import.meta.url);

const angularVersion = Number(VERSION.major);
let sourceFileCache: any;
let cjt: Function;
let jt: any;

if (angularVersion < 15) {
  throw new Error('AnalogJS is not compatible with Angular v14 and lower');
} else if (angularVersion >= 15 && angularVersion < 16) {
  const cp = require('@angular-devkit/build-angular/src/builders/browser-esbuild/compiler-plugin.js');
  const {
    createJitResourceTransformer,
  } = require('@angular-devkit/build-angular/src/builders/browser-esbuild/angular/jit-resource-transformer.js');
  const {
    JavaScriptTransformer,
  } = require('@angular-devkit/build-angular/src/builders/browser-esbuild/javascript-transformer.js');

  sourceFileCache = cp.SourceFileCache;
  cjt = createJitResourceTransformer;
  jt = JavaScriptTransformer;
} else if (angularVersion >= 16 && angularVersion < 18) {
  const cp = require('@angular-devkit/build-angular/src/tools/esbuild/angular/compiler-plugin.js');
  const {
    createJitResourceTransformer,
  } = require('@angular-devkit/build-angular/src/tools/esbuild/angular/jit-resource-transformer.js');
  const {
    JavaScriptTransformer,
  } = require('@angular-devkit/build-angular/src/tools/esbuild/javascript-transformer.js');

  /**
   * Workaround for compatibility with Angular 17.0+
   */
  if (typeof cp['SourceFileCache'] !== 'undefined') {
    sourceFileCache = cp.SourceFileCache;
  } else {
    sourceFileCache = sfc.SourceFileCache;
  }

  cjt = createJitResourceTransformer;
  jt = JavaScriptTransformer;
} else {
  const {
    createJitResourceTransformer,
    JavaScriptTransformer,
    SourceFileCache,
  } = require('@angular/build/private');

  sourceFileCache = SourceFileCache;
  cjt = createJitResourceTransformer;
  jt = JavaScriptTransformer;
}

export {
  cjt as createJitResourceTransformer,
  jt as JavaScriptTransformer,
  sourceFileCache as SourceFileCache,
  CompilerPluginOptions,
};
