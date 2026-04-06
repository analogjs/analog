import type { Plugin } from 'vite';
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

export interface StylePipelineContext {
  workspaceRoot: string;
}

export type StylePipelinePluginFactory = (
  context: StylePipelineContext,
) => Plugin | Plugin[] | false | null | undefined;

export type StylePipelinePluginEntry =
  | Plugin
  | Plugin[]
  | StylePipelinePluginFactory
  | false
  | null
  | undefined;

export interface StylePipelineOptions {
  plugins?: StylePipelinePluginEntry[];
  angularPlugins?: AngularStylePipelinePlugin[];
}

export function defineStylePipeline<const T extends StylePipelineOptions>(
  options: T,
): T {
  return options;
}

export function defineStylePipelinePlugins<
  const T extends StylePipelinePluginEntry[],
>(plugins: T): T {
  return plugins;
}

export function resolveStylePipelinePlugins(
  options: StylePipelineOptions | false | undefined,
  workspaceRoot?: string,
): Plugin[] {
  if (!options?.plugins?.length) {
    return [];
  }

  const context: StylePipelineContext = {
    workspaceRoot:
      workspaceRoot ?? process.env['NX_WORKSPACE_ROOT'] ?? process.cwd(),
  };

  const resolved: Plugin[] = [];

  for (const entry of options.plugins) {
    const plugins = typeof entry === 'function' ? entry(context) : entry;

    if (!plugins) {
      continue;
    }

    if (Array.isArray(plugins)) {
      resolved.push(...plugins);
      continue;
    }

    resolved.push(plugins);
  }

  return resolved;
}
