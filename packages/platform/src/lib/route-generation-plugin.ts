import type { Plugin } from 'vite';

import type { Options, TypedRouterOptions } from './options.js';
import {
  typedRoutes,
  type TypedRoutesPluginOptions,
} from './typed-routes-plugin.js';
import { debugTypedRouter } from './utils/debug.js';

function resolveTypedRouterOptions(experimental: Options['experimental']): {
  enabled: boolean;
  options: TypedRouterOptions;
} {
  const typedRouter = experimental?.typedRouter;
  if (!typedRouter) {
    return { enabled: false, options: {} };
  }
  if (typedRouter === true) {
    return { enabled: true, options: { jsonLdManifest: true } };
  }
  return {
    enabled: true,
    options: {
      ...typedRouter,
      jsonLdManifest: typedRouter.jsonLdManifest ?? true,
    },
  };
}

export function routeGenerationPlugin(options?: Options): Plugin {
  const { enabled, options: typedRouterOptions } = resolveTypedRouterOptions(
    options?.experimental,
  );

  if (!enabled) {
    debugTypedRouter('disabled by experimental.typedRouter === false');
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
  debugTypedRouter('enabled', {
    outFile: pluginOptions.outFile,
    jsonLdManifest: pluginOptions.jsonLdManifest,
    additionalPagesDirs: pluginOptions.additionalPagesDirs,
    additionalContentDirs: pluginOptions.additionalContentDirs,
  });

  return typedRoutes(pluginOptions);
}
