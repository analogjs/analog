import type {
  StylesheetDependency,
  StylesheetDiagnostic,
  StylesheetTransformContext,
  StylesheetTransformResult,
} from './style-preprocessor.js';

export interface StylePipelineStylesheetRegistry {
  getPublicIdsForSource(sourcePath: string): string[];
  getRequestIdsForSource(sourcePath: string): string[];
  getDependenciesForSource(sourcePath: string): StylesheetDependency[];
  getDiagnosticsForSource(sourcePath: string): StylesheetDiagnostic[];
  getTagsForSource(sourcePath: string): string[];
}

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

export function defineAngularStylePipeline<
  const T extends AngularStylePipelineOptions,
>(options: T): T {
  return options;
}

export function defineAngularStylePipelinePlugins<
  const T extends AngularStylePipelinePlugin[],
>(plugins: T): T {
  return plugins;
}
