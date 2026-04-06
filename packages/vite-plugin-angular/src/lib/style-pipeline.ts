import type { AnalogStylesheetRegistry } from './stylesheet-registry.js';
export type {
  AngularStylePipelineContext,
  AngularStylePipelineOptions,
  AngularStylePipelinePlugin,
} from '@analogjs/style-pipeline';
import type {
  AngularStylePipelineContext,
  AngularStylePipelineOptions,
} from '@analogjs/style-pipeline';
import type {
  StylePreprocessor,
  StylesheetTransformResult,
  StylesheetTransformContext,
} from '@analogjs/style-pipeline/style-preprocessor';
import { normalizeStylesheetTransformResult } from '@analogjs/style-pipeline/style-preprocessor';
import { debugStylePipeline } from './utils/debug.js';

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
