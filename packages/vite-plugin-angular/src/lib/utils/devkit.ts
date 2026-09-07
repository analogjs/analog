import { VERSION } from '@angular/compiler-cli';
import { createRequire } from 'node:module';
import { Schema } from 'effect';
import type {
  createAngularCompilation as AngularCompilationFactory,
  createJitResourceTransformer as JitResourceFactory,
} from '@angular/build/private';
import type { JavaScriptTransformOptions } from '../javascript-transformer.js';
import type { TransformCacheStore } from './transform-cache.js';

export type { CompilerPluginOptions } from './compiler-plugin-options.js';
export { SourceFileCache } from './source-file-cache.js';

const require = createRequire(import.meta.url);
export const angularMajor: number = Number(VERSION.major);
export const angularMinor: number = Number(VERSION.minor);
export const angularPatch: number = Number(VERSION.patch);
export const angularFullVersion: number =
  angularMajor * 10000 + angularMinor * 100 + angularPatch;

interface NativeJavaScriptTransformer {
  transformFile(file: string): Promise<Uint8Array>;
  transformData(
    file: string,
    code: string,
    skipLinker: boolean,
    sideEffects: boolean,
  ): Promise<Uint8Array>;
  close(): Promise<void>;
}

type TransformerConstructor = new (
  options: JavaScriptTransformOptions,
  threads: number,
  cache?: TransformCacheStore,
) => NativeJavaScriptTransformer;

// These opaque callable contracts validate the installed module's capabilities;
// the Angular/Vite consumer matrix qualifies their version-specific behavior.
const AngularToolchain = Schema.Struct({
  JavaScriptTransformer: Schema.declare<TransformerConstructor>(
    (value): value is TransformerConstructor => typeof value === 'function',
  ),
  createJitResourceTransformer: Schema.declare<typeof JitResourceFactory>(
    (value): value is typeof JitResourceFactory => typeof value === 'function',
  ),
  createAngularCompilation: Schema.optionalKey(
    Schema.declare<typeof AngularCompilationFactory>(
      (value): value is typeof AngularCompilationFactory =>
        typeof value === 'function',
    ),
  ),
});
let cachedToolchain: typeof AngularToolchain.Type | undefined;

function loadToolchain(): typeof AngularToolchain.Type {
  if (cachedToolchain) return cachedToolchain;
  if (angularMajor < 17)
    throw new Error('AnalogJS is not compatible with Angular v16 and lower');
  const exports: unknown =
    angularMajor === 17
      ? {
          ...require('@angular-devkit/build-angular/src/tools/esbuild/angular/jit-resource-transformer.js'),
          ...require('@angular-devkit/build-angular/src/tools/esbuild/javascript-transformer.js'),
        }
      : require('@angular/build/private');
  cachedToolchain = Schema.decodeUnknownSync(AngularToolchain)(exports);
  return cachedToolchain;
}

export function supportsAngularCompilation(): boolean {
  return loadToolchain().createAngularCompilation !== undefined;
}

export const createJitResourceTransformer: typeof JitResourceFactory = (
  ...args
) => loadToolchain().createJitResourceTransformer(...args);

export const createAngularCompilation: typeof AngularCompilationFactory = (
  ...args
) => {
  const factory = loadToolchain().createAngularCompilation;
  if (!factory)
    throw new Error(
      '[@analogjs/vite-plugin-angular]: The experimental Compilation API requires @angular/build/private to export createAngularCompilation. Use a compatible @angular/build version or set experimental.useAngularCompilationAPI to false.',
    );
  return factory(...args);
};

/** Loading the package and constructing a plugin never starts Angular workers. */
export class JavaScriptTransformer implements NativeJavaScriptTransformer {
  private readonly native: NativeJavaScriptTransformer;
  constructor(
    options: JavaScriptTransformOptions,
    threads: number,
    cache?: TransformCacheStore,
  ) {
    this.native = new (loadToolchain().JavaScriptTransformer)(
      options,
      threads,
      cache,
    );
  }
  transformFile(file: string): Promise<Uint8Array> {
    return this.native.transformFile(file);
  }
  transformData(
    file: string,
    code: string,
    skipLinker: boolean,
    sideEffects: boolean,
  ): Promise<Uint8Array> {
    return this.native.transformData(file, code, skipLinker, sideEffects);
  }
  close(): Promise<void> {
    return this.native.close();
  }
}
