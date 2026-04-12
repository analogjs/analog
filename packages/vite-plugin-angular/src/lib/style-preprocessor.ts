export interface StylesheetTransformContext {
  filename: string;
  containingFile?: string;
  resourceFile?: string;
  className?: string;
  order?: number;
  inline: boolean;
}

export interface StylesheetDependency {
  id: string;
  kind?: 'file' | 'virtual' | 'token' | 'bridge' | 'manifest' | 'runtime';
  owner?: string;
}

export interface StylesheetDiagnostic {
  severity: 'warning' | 'error';
  code: string;
  message: string;
}

export interface StylesheetTransformResult {
  code: string;
  dependencies?: Array<string | StylesheetDependency>;
  diagnostics?: StylesheetDiagnostic[];
  tags?: string[];
}

export interface StylePipelineStylesheetRegistry {
  getPublicIdsForSource(sourcePath: string): string[];
  getRequestIdsForSource(sourcePath: string): string[];
  getDependenciesForSource(sourcePath: string): StylesheetDependency[];
  getDiagnosticsForSource(sourcePath: string): StylesheetDiagnostic[];
  getTagsForSource(sourcePath: string): string[];
}

export type StylePreprocessor = (
  code: string,
  filename: string,
  context?: StylesheetTransformContext,
) => string | StylesheetTransformResult;

export function normalizeStylesheetTransformResult(
  value: string | StylesheetTransformResult | undefined,
  fallbackCode: string,
): StylesheetTransformResult {
  if (value == null) {
    return { code: fallbackCode };
  }

  if (typeof value === 'string') {
    return { code: value };
  }

  return {
    code: value.code ?? fallbackCode,
    dependencies: value.dependencies ?? [],
    diagnostics: value.diagnostics ?? [],
    tags: value.tags ?? [],
  };
}

export function normalizeStylesheetDependencies(
  dependencies: Array<string | StylesheetDependency> | undefined,
): StylesheetDependency[] {
  return (dependencies ?? []).map((dependency) =>
    typeof dependency === 'string' ? { id: dependency } : dependency,
  );
}

export function composeStylePreprocessors(
  preprocessors: Array<StylePreprocessor | false | null | undefined>,
): StylePreprocessor | undefined {
  const active = preprocessors.filter(
    (preprocessor): preprocessor is StylePreprocessor => !!preprocessor,
  );

  if (!active.length) {
    return undefined;
  }

  return (code, filename, context) => {
    let current = normalizeStylesheetTransformResult(undefined, code);

    for (const preprocessor of active) {
      const next = normalizeStylesheetTransformResult(
        preprocessor(current.code, filename, context),
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
