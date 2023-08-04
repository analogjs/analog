import * as wbl from '@angular-devkit/build-angular/src/tools/babel/webpack-loader';
import * as app from '@angular-devkit/build-angular/src/tools/babel/presets/application';

let requiresLinking: Function;
/**
 * Workaround for compatibility with Angular 16.2+
 */
if (typeof wbl['requiresLinking'] !== 'undefined') {
  requiresLinking = wbl.requiresLinking;
} else if (typeof (app as any)['requiresLinking'] !== 'undefined') {
  requiresLinking = (app as any)['requiresLinking'] as Function;
}

const angularApplicationPreset = app.default;
import { createJitResourceTransformer } from '@angular-devkit/build-angular/src/tools/esbuild/angular/jit-resource-transformer';
import { CompilerPluginOptions } from '@angular-devkit/build-angular/src/tools/esbuild/angular/compiler-plugin';
import { JavaScriptTransformer } from '@angular-devkit/build-angular/src/tools/esbuild/javascript-transformer';
import { SourceFileCache } from '@angular-devkit/build-angular/src/tools/esbuild/angular/compiler-plugin';

export {
  requiresLinking,
  angularApplicationPreset,
  createJitResourceTransformer,
  CompilerPluginOptions,
  JavaScriptTransformer,
  SourceFileCache,
};
