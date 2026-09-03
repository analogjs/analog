import type { Plugin } from 'vite';

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
