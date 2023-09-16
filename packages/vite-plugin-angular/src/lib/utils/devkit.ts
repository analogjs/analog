import * as wbl from '@angular-devkit/build-angular/src/tools/babel/webpack-loader.js';
import * as app from '@angular-devkit/build-angular/src/tools/babel/presets/application.js';

let requiresLinking: Function;
/**
 * Workaround for compatibility with Angular 16.2+
 */
if (typeof (wbl as any)['requiresLinking'] !== 'undefined') {
  requiresLinking = (wbl as any).requiresLinking;
} else if (typeof (app as any)['requiresLinking'] !== 'undefined') {
  requiresLinking = (app as any)['requiresLinking'] as Function;
}

const angularApplicationPreset = app.default;
import { createJitResourceTransformer } from '@angular-devkit/build-angular/src/tools/esbuild/angular/jit-resource-transformer.js';
import { CompilerPluginOptions } from '@angular-devkit/build-angular/src/tools/esbuild/angular/compiler-plugin.js';
import { JavaScriptTransformer } from '@angular-devkit/build-angular/src/tools/esbuild/javascript-transformer.js';
import { SourceFileCache } from '@angular-devkit/build-angular/src/tools/esbuild/angular/compiler-plugin.js';

export {
  requiresLinking,
  angularApplicationPreset,
  createJitResourceTransformer,
  CompilerPluginOptions,
  JavaScriptTransformer,
  SourceFileCache,
};
