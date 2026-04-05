import type { Plugin } from 'vite';
import type { AngularStylePipelinePlugin } from '@analogjs/vite-plugin-angular';
import type { StandardSchemaV1 } from '@standard-schema/spec';

export interface StylePipelineContext {
  workspaceRoot: string;
}

export interface StylePipelineOutput<TMetadata = unknown> {
  id: string;
  kind: 'css' | 'theme' | 'tokens' | 'manifest' | 'typescript';
  scope: 'global' | 'component' | 'theme';
  order: number;
  absolutePath?: string;
  rootRelativePath?: string;
  importId?: string | null;
  inject?: boolean;
  tags?: string[];
  metadata?: TMetadata;
}

export interface StylePipelineManifest<TMetadata = unknown> {
  outputs: StylePipelineOutput<TMetadata>[];
  metadataSchema?: StandardSchemaV1<TMetadata, TMetadata>;
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
  /**
   * Community-owned Vite plugins or small factories that return plugins.
   *
   * Factories receive Analog's resolved workspace root so plugins can align
   * their cache paths, file watching, and generated output locations with the
   * host workspace.
   */
  plugins?: StylePipelinePluginEntry[];
  /**
   * Community-owned Angular stylesheet-resource plugins.
   *
   * These participate in the Angular compiler/style resource pipeline through
   * `@analogjs/vite-plugin-angular`, which is the deep framework seam that a
   * standalone Vite plugin cannot own by itself.
   */
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
