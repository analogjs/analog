import { VERSION } from '@angular/compiler-cli';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import type { JavaScriptTransformer as AngularJavaScriptTransformer } from '@angular/build/private';
import type { CompilerPluginOptions } from './compiler-plugin-options.js';
import type { TransformCacheStore } from './transform-cache.js';
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
let usesTransformOptions = false;
let initializeHash: (() => Promise<void>) | undefined;

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

  const [buildMajor, buildMinor] = require('@angular/build/package.json')
    .version.split('.')
    .map(Number);
  usesTransformOptions =
    buildMajor > 22 || (buildMajor === 22 && buildMinor >= 2);
  if (usesTransformOptions) {
    ({ initializeHash } = require(
      join(
        dirname(require.resolve('@angular/build/package.json')),
        'src/utils/hash.js',
      ),
    ));
  }
}

// Keep Angular's private transformer API differences at the compatibility boundary.
class JavaScriptTransformer extends jt {
  constructor(
    options: Partial<
      ConstructorParameters<typeof AngularJavaScriptTransformer>[0]
    >,
    maxThreads: number,
    cache?: TransformCacheStore,
  ) {
    if (usesTransformOptions) {
      super({ ...options, maxConcurrency: maxThreads }, cache);
    } else {
      super(options, maxThreads, cache);
    }
  }

  async transformFile(
    filename: string,
    skipLinker?: boolean,
    sideEffects?: boolean,
    instrumentForCoverage?: boolean,
  ): Promise<Uint8Array> {
    if (usesTransformOptions) {
      await initializeHash!();
      return super.transformFile(filename, {
        skipLinker,
        sideEffects:
          sideEffects === undefined ? undefined : async () => sideEffects,
        instrumentForCoverage,
      });
    }
    return super.transformFile(
      filename,
      skipLinker,
      sideEffects,
      instrumentForCoverage,
    );
  }

  async transformData(
    filename: string,
    data: string,
    skipLinker: boolean,
    sideEffects?: boolean,
    instrumentForCoverage?: boolean,
  ): Promise<Uint8Array> {
    if (usesTransformOptions) {
      await initializeHash!();
      return super.transformData(filename, data, {
        skipLinker,
        sideEffects:
          sideEffects === undefined ? undefined : async () => sideEffects,
        instrumentForCoverage,
      });
    }
    return super.transformData(
      filename,
      data,
      skipLinker,
      sideEffects,
      instrumentForCoverage,
    );
  }

  close(): Promise<void> {
    return super.close();
  }
}

export {
  cjt as createJitResourceTransformer,
  JavaScriptTransformer,
  sourceFileCache as SourceFileCache,
  CompilerPluginOptions,
  angularMajor,
  angularMinor,
  angularPatch,
  createAngularCompilation,
  angularFullVersion,
};
