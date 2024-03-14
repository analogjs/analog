import * as wbl from '@angular-devkit/build-angular/src/tools/babel/webpack-loader.js';
import * as app from '@angular-devkit/build-angular/src/tools/babel/presets/application.js';
import * as cp from '@angular-devkit/build-angular/src/tools/esbuild/angular/compiler-plugin.js';
import * as sfc from './source-file-cache.js';

let requiresLinking: Function;
/**
 * Workaround for compatibility with Angular 16.2+
 */
if (typeof (wbl as any)['requiresLinking'] !== 'undefined') {
  requiresLinking = (wbl as any).requiresLinking;
} else if (typeof (app as any)['requiresLinking'] !== 'undefined') {
  requiresLinking = (app as any)['requiresLinking'] as Function;
}

/**
 * Workaround for compatibility with Angular 17.0+
 */
let sourceFileCache: any;
if (typeof (cp as any)['SourceFileCache'] !== 'undefined') {
  sourceFileCache = (cp as any).SourceFileCache;
} else {
  sourceFileCache = sfc.SourceFileCache;
}

const angularApplicationPreset = app.default;
import { createJitResourceTransformer } from '@angular-devkit/build-angular/src/tools/esbuild/angular/jit-resource-transformer.js';
import { CompilerPluginOptions } from '@angular-devkit/build-angular/src/tools/esbuild/angular/compiler-plugin.js';
import { JavaScriptTransformer } from '@angular-devkit/build-angular/src/tools/esbuild/javascript-transformer.js';

export {
  requiresLinking,
  angularApplicationPreset,
  createJitResourceTransformer,
  CompilerPluginOptions,
  JavaScriptTransformer,
  sourceFileCache as SourceFileCache,
};
