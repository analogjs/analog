import * as wbl from '@angular-devkit/build-angular/src/tools/babel/webpack-loader';
import * as app from '@angular-devkit/build-angular/src/tools/babel/presets/application';
import * as cp from '@angular-devkit/build-angular/src/tools/esbuild/angular/compiler-plugin';

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
  const sfc = require('@angular-devkit/build-angular/src/tools/esbuild/angular/source-file-cache');
  sourceFileCache = sfc.SourceFileCache;
}

const angularApplicationPreset = app.default;
import { createJitResourceTransformer } from '@angular-devkit/build-angular/src/tools/esbuild/angular/jit-resource-transformer';
import { CompilerPluginOptions } from '@angular-devkit/build-angular/src/tools/esbuild/angular/compiler-plugin';
import { JavaScriptTransformer } from '@angular-devkit/build-angular/src/tools/esbuild/javascript-transformer';

import { loadEsmModule } from '@angular-devkit/build-angular/src/utils/load-esm';
import { SourceFileCache } from '@angular-devkit/build-angular/src/tools/esbuild/angular/source-file-cache';

export {
  requiresLinking,
  loadEsmModule,
  angularApplicationPreset,
  createJitResourceTransformer,
  CompilerPluginOptions,
  JavaScriptTransformer,
  sourceFileCache as SourceFileCache,
};
