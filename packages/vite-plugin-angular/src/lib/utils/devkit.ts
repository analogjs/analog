import { VERSION } from '@angular/compiler-cli';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import type { JavaScriptTransformer as AngularJavaScriptTransformer } from '@angular/build/private';
import type { CompilerPluginOptions } from './compiler-plugin-options.js';
import type { TransformCacheStore } from './transform-cache.js';

const require = createRequire(import.meta.url);

const angularMajor = Number(VERSION.major);
const angularMinor = Number(VERSION.minor);
const angularPatch = Number(VERSION.patch);
const padVersion = (version: number) => String(version).padStart(2, '0');
const angularFullVersion = Number(
  `${angularMajor}${padVersion(angularMinor)}${padVersion(angularPatch)}`,
);
const usesTransformOptions = angularFullVersion >= 220200;
let initializeHash: (() => Promise<void>) | undefined;

if (angularMajor < 20) {
  throw new Error('AnalogJS is not compatible with Angular v19 and lower');
}

const {
  createJitResourceTransformer,
  JavaScriptTransformer: AngularJavaScriptTransformerClass,
  SourceFileCache,
  createAngularCompilation: createAngularCompilationFn,
} = require('@angular/build/private');

// `@angular/build` exports `createAngularCompilation` from v20.2.
const createAngularCompilation =
  createAngularCompilationFn &&
  (async (...args: unknown[]) => {
    await initializeHash?.();
    return createAngularCompilationFn(...args);
  });

if (usesTransformOptions) {
  ({ initializeHash } = require(
    join(
      dirname(require.resolve('@angular/build/package.json')),
      'src/utils/hash.js',
    ),
  ));
}

// Keep Angular's private transformer API differences at the compatibility boundary.
class JavaScriptTransformer extends AngularJavaScriptTransformerClass {
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
  createJitResourceTransformer,
  JavaScriptTransformer,
  SourceFileCache,
  CompilerPluginOptions,
  angularMajor,
  angularMinor,
  angularPatch,
  createAngularCompilation,
  angularFullVersion,
};
