import type { ResourceDependencies } from './resource-dependencies.js';
import * as Context from 'effect/Context';
import * as Data from 'effect/Data';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import {
  preprocessStylesheetResult,
  registerStylesheetContent,
  type AnalogStylesheetRegistry,
} from './stylesheet-registry.js';
import type { StylePreprocessor } from './style-preprocessor.js';

export interface StylesheetRequest {
  readonly data: string;
  readonly containingFile: string;
  readonly resourceFile: string | undefined;
  readonly className: string | undefined;
  readonly order: number | undefined;
  readonly inlineStylesExtension: string;
  readonly registry: AnalogStylesheetRegistry | undefined;
  readonly preprocessor: StylePreprocessor | undefined;
  readonly dependencies?: Set<string>;
}

export class StylesheetFailure extends Data.TaggedError('StylesheetFailure')<{
  readonly phase: 'preprocess' | 'compile' | 'register';
  readonly file: string;
  readonly cause: unknown;
  readonly message: string;
}> {}

export function stylesheetFailure(
  phase: StylesheetFailure['phase'],
  file: string,
  cause: unknown,
): StylesheetFailure {
  if (cause instanceof StylesheetFailure) return cause;
  return new StylesheetFailure({
    phase,
    file,
    cause,
    message: `Unable to ${phase} stylesheet ${file}: ${cause instanceof Error ? cause.message : String(cause)}`,
  });
}

export class StylesheetCompiler extends Context.Service<
  StylesheetCompiler,
  {
    readonly compile: (
      code: string,
      file: string,
    ) => Effect.Effect<string | undefined, StylesheetFailure>;
  }
>()('@analogjs/vite-plugin-angular/StylesheetCompiler') {}

/** Externalized CSS re-enters Vite's pipeline; inline CSS is compiled here once. */
export const transformStylesheet: (
  request: StylesheetRequest,
) => Effect.Effect<string | undefined, StylesheetFailure, StylesheetCompiler> =
  Effect.fn('analog.stylesheet.transform')(function* (request) {
    const { containingFile, resourceFile, className, order } = request;
    const file =
      resourceFile ??
      containingFile.replace('.ts', `.${request.inlineStylesExtension}`);
    const identity = {
      containingFile,
      ...(resourceFile === undefined ? {} : { resourceFile }),
      ...(className === undefined ? {} : { className }),
      ...(order === undefined ? {} : { order }),
    };
    const preprocessed = yield* Effect.try({
      try: () =>
        preprocessStylesheetResult(request.data, file, request.preprocessor, {
          filename: file,
          ...identity,
          inline: !resourceFile,
        }),
      catch: (cause) => stylesheetFailure('preprocess', file, cause),
    });
    for (const dependency of preprocessed.dependencies) {
      if (dependency.kind === undefined || dependency.kind === 'file')
        request.dependencies?.add(dependency.id);
    }
    const registry = request.registry;
    if (registry) {
      return yield* Effect.try({
        try: () =>
          registerStylesheetContent(registry, {
            ...preprocessed,
            ...identity,
            inlineStylesExtension: request.inlineStylesExtension,
          }),
        catch: (cause) => stylesheetFailure('register', file, cause),
      });
    }
    const compiler = yield* StylesheetCompiler;
    return yield* compiler.compile(preprocessed.code, `${file}?direct`);
  });

export type NativeStylesheetCompiler = (
  code: string,
  file: string,
) =>
  | { code: string; deps?: Set<string> }
  | null
  | undefined
  | Promise<{ code: string; deps?: Set<string> } | null | undefined>;

export function stylesheetCompilerLayer(
  compile: NativeStylesheetCompiler,
): Layer.Layer<StylesheetCompiler> {
  return Layer.succeed(StylesheetCompiler, {
    compile: (code, file) =>
      Effect.tryPromise({
        try: async () => (await compile(code, file))?.code,
        catch: (cause) => stylesheetFailure('compile', file, cause),
      }),
  });
}

/** A finite callback into Angular; the enclosing compiler drains these calls. */
export function createStylesheetTransform(
  compile: NativeStylesheetCompiler,
  graph?: ResourceDependencies,
): (request: StylesheetRequest) => Promise<string | undefined> {
  return async (request) => {
    const dependencies = new Set<string>();
    const layer = stylesheetCompilerLayer(async (code, file) => {
      const result = await compile(code, file);
      for (const dependency of result?.deps ?? []) dependencies.add(dependency);
      return result;
    });
    const code = await Effect.runPromise(
      transformStylesheet({ ...request, dependencies }).pipe(
        Effect.provide(layer),
      ),
    );
    const source = request.resourceFile ?? request.containingFile;
    graph?.replace(
      source,
      request.resourceFile
        ? dependencies
        : [...graph.dependencies(source), ...dependencies],
    );
    return code;
  };
}
