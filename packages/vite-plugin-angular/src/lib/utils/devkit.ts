import { VERSION } from '@angular/compiler-cli';
import { createRequire } from 'node:module';
import type { CompilerPluginOptions } from './compiler-plugin-options.js';
import * as sfc from './source-file-cache.js';

const require = createRequire(import.meta.url);

const angularMajor = Number(VERSION.major);
const angularMinor = Number(VERSION.minor);
const angularPatch = Number(VERSION.patch);
const padVersion = (version: number) => String(version).padStart(2, '0');
const angularFullVersion = Number(
  `${angularMajor}${padVersion(angularMinor)}${padVersion(angularPatch)}`,
);
let sourceFileCache: any;
let cjt: Function;
let jt: any;
let createAngularCompilation: Function;

if (angularMajor < 17) {
  throw new Error('AnalogJS is not compatible with Angular v16 and lower');
} else if (angularMajor >= 17 && angularMajor < 18) {
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
    createAngularCompilation: createAngularCompilationFn,
  } = require('@angular/build/private');

  sourceFileCache = SourceFileCache;
  cjt = createJitResourceTransformer;
  jt = JavaScriptTransformer;
  createAngularCompilation = createAngularCompilationFn;
}

export {
  cjt as createJitResourceTransformer,
  jt as JavaScriptTransformer,
  sourceFileCache as SourceFileCache,
  CompilerPluginOptions,
  angularMajor,
  angularMinor,
  angularPatch,
  createAngularCompilation,
  angularFullVersion,
};
