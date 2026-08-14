import type { AnalogStylesheetRegistry } from './stylesheet-registry.js';
import type {
  StylePipelineStylesheetRegistry,
  StylePreprocessor,
  StylesheetTransformContext,
  StylesheetTransformResult,
} from './style-preprocessor.js';
import { normalizeStylesheetTransformResult } from './style-preprocessor.js';
import { debugStylePipeline } from './utils/debug.js';

export interface AngularStylePipelineContext {
  workspaceRoot: string;
}

export interface AngularStylePipelinePlugin {
  name: string;
  preprocessStylesheet?: (
    code: string,
    context: StylesheetTransformContext,
  ) => string | StylesheetTransformResult | undefined;
  configureStylesheetRegistry?: (
    registry: StylePipelineStylesheetRegistry,
    context: AngularStylePipelineContext,
  ) => void;
}

export interface AngularStylePipelineOptions {
  plugins: AngularStylePipelinePlugin[];
}

export function stylePipelinePreprocessorFromPlugins(
  options: AngularStylePipelineOptions | undefined,
): StylePreprocessor | undefined {
  const preprocessors =
    options?.plugins
      .map((plugin) => plugin.preprocessStylesheet)
      .filter((preprocessor) => !!preprocessor) ?? [];

  if (!preprocessors.length) {
    return undefined;
  }

  return (code, filename, context) => {
    if (!context) {
      debugStylePipeline(
        'skipping community stylesheet preprocessors because Angular did not provide a stylesheet context',
        {
          filename,
        },
      );
      return code;
    }

    let current = normalizeStylesheetTransformResult(undefined, code);
    for (const preprocess of preprocessors) {
      const next = normalizeStylesheetTransformResult(
        preprocess(current.code, context),
        current.code,
      );
      current = {
        code: next.code,
        dependencies: [
          ...(current.dependencies ?? []),
          ...(next.dependencies ?? []),
        ],
        diagnostics: [
          ...(current.diagnostics ?? []),
          ...(next.diagnostics ?? []),
        ],
        tags: [...(current.tags ?? []), ...(next.tags ?? [])],
      };
    }

    return current;
  };
}

export function configureStylePipelineRegistry(
  options: AngularStylePipelineOptions | undefined,
  registry: AnalogStylesheetRegistry,
  context: AngularStylePipelineContext,
): void {
  for (const plugin of options?.plugins ?? []) {
    plugin.configureStylesheetRegistry?.(registry, context);
  }
}
