import {
  typedRoutes,
  type TypedRoutesPluginOptions,
} from '@analogjs/vite-plugin-routes';
import type { Plugin } from 'vite';

import type { Options, TypedRouterOptions } from './options.js';

function resolveTypedRouterOptions(experimental: Options['experimental']): {
  enabled: boolean;
  options: TypedRouterOptions;
} {
  const typedRouter = experimental?.typedRouter;
  if (!typedRouter) {
    return { enabled: false, options: {} };
  }
  if (typedRouter === true) {
    return { enabled: true, options: {} };
  }
  return {
    enabled: true,
    options: typedRouter,
  };
}

export function routeGenerationPlugin(options?: Options): Plugin {
  const { enabled, options: typedRouterOptions } = resolveTypedRouterOptions(
    options?.experimental,
  );

  if (!enabled) {
    return {
      name: 'analog-route-generation-disabled',
    };
  }

  const pluginOptions: TypedRoutesPluginOptions = {
    ...typedRouterOptions,
    workspaceRoot: options?.workspaceRoot,
    additionalPagesDirs: options?.additionalPagesDirs,
    additionalContentDirs: options?.additionalContentDirs,
  };

  // `@analogjs/platform` remains the default opt-in surface, but the actual
  // route generation work now lives in the dedicated public routes plugin.
  return typedRoutes(pluginOptions);
}
