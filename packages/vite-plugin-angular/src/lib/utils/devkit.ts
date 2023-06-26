import { requiresLinking } from '@angular-devkit/build-angular/src/tools/babel/webpack-loader';
import angularApplicationPreset from '@angular-devkit/build-angular/src/tools/babel/presets/application';

import { createJitResourceTransformer } from '@angular-devkit/build-angular/src/tools/esbuild/angular/jit-resource-transformer';
import { CompilerPluginOptions } from '@angular-devkit/build-angular/src/tools/esbuild/angular/compiler-plugin';
import { JavaScriptTransformer } from '@angular-devkit/build-angular/src/tools/esbuild/javascript-transformer';
import { SourceFileCache } from '@angular-devkit/build-angular/src/tools/esbuild/angular/compiler-plugin';

import { loadEsmModule } from '@angular-devkit/build-angular/src/utils/load-esm';

export {
  requiresLinking,
  loadEsmModule,
  angularApplicationPreset,
  createJitResourceTransformer,
  CompilerPluginOptions,
  JavaScriptTransformer,
  SourceFileCache,
};
