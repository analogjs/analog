import { Plugin } from 'vite';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import viteNitroPlugin from '@analogjs/vite-plugin-nitro';
import angular from '@analogjs/vite-plugin-angular';

import { Options } from './options.js';
import { routerPlugin } from './router-plugin.js';
import {
  ssrBuildPlugin,
  i18nDefRegistryPlugin,
} from './ssr/ssr-build-plugin.js';
import {
  deferStreamingPlugin,
  streamingSupportedOnAngular,
  MIN_STREAMING_ANGULAR_MAJOR,
} from './ssr/defer-streaming-plugin.js';
import { contentPlugin } from './content-plugin.js';
import { clearClientPageEndpointsPlugin } from './clear-client-page-endpoint.js';
import { ssrXhrBuildPlugin } from './ssr/ssr-xhr-plugin.js';
import { depsPlugin } from './deps-plugin.js';
import { injectHTMLPlugin } from './ssr/inject-html-plugin.js';
import { serverModePlugin } from '../server-mode-plugin.js';
import { i18nExtractPlugin } from './i18n-extract-plugin.js';

/**
 * The installed `@angular/core` major version, resolved from the project root
 * (where the app's Angular is installed). Returns `null` when it cannot be
 * detected, in which case streaming is not blocked and the build-time
 * anchor-drift detection is relied on instead.
 */
function getAngularCoreMajor(): number | null {
  try {
    const req = createRequire(join(process.cwd(), 'noop.js'));
    const { version } = req('@angular/core/package.json') as {
      version: string;
    };
    const major = Number.parseInt(version.split('.')[0], 10);
    return Number.isNaN(major) ? null : major;
  } catch {
    return null;
  }
}

export function platformPlugin(opts: Options = {}): Plugin[] {
  const isTest = process.env['NODE_ENV'] === 'test' || !!process.env['VITEST'];
  const { ...platformOptions } = {
    ssr: true,
    ...opts,
  };

  // Gate experimental streaming SSR on an Angular version whose compiled
  // @angular/core matches the patch anchors (see MIN_STREAMING_ANGULAR_MAJOR).
  // Reflect the gated value back onto platformOptions so the nitro renderer
  // selection and the deferStreamingPlugin registration below stay consistent —
  // never select the streaming renderer without applying the patch.
  if (platformOptions.ssr && platformOptions.experimental?.streaming) {
    const major = getAngularCoreMajor();
    if (!streamingSupportedOnAngular(major)) {
      console.warn(
        `[@analogjs/platform] experimental.streaming requires Angular ` +
          `${MIN_STREAMING_ANGULAR_MAJOR}+ (detected v${major}); streaming is ` +
          `disabled and rendering falls back to buffered SSR.`,
      );
      platformOptions.experimental = {
        ...platformOptions.experimental,
        streaming: false,
      };
    }
  }

  let nitroOptions = platformOptions?.nitro;

  if (nitroOptions?.routeRules) {
    nitroOptions = {
      ...nitroOptions,
      routeRules: Object.keys(nitroOptions.routeRules).reduce(
        (config, curr) => {
          return {
            ...config,
            [curr]: {
              ...config[curr],
              headers: {
                ...config[curr].headers,
                'x-analog-no-ssr':
                  config[curr]?.ssr === false ? 'true' : undefined,
              } as any,
            },
          };
        },
        nitroOptions.routeRules,
      ),
    };
  }

  return [
    ...viteNitroPlugin(platformOptions, nitroOptions),
    ...(platformOptions.ssr ? [ssrBuildPlugin(), ...injectHTMLPlugin()] : []),
    ...(platformOptions.ssr && platformOptions.experimental?.streaming
      ? [deferStreamingPlugin()]
      : []),
    ...(!isTest ? depsPlugin(platformOptions) : []),
    ...routerPlugin(platformOptions),
    ...contentPlugin(platformOptions?.content, platformOptions),
    ...((opts?.vite === false
      ? []
      : angular({
          jit: platformOptions.jit,
          workspaceRoot: platformOptions.workspaceRoot,
          disableTypeChecking: platformOptions.disableTypeChecking ?? false,
          include: [
            ...(platformOptions.include ?? []),
            ...(platformOptions.additionalPagesDirs ?? []).map(
              (pageDir) => `${pageDir}/**/*.page.ts`,
            ),
          ],
          additionalContentDirs: platformOptions.additionalContentDirs,
          liveReload: platformOptions.liveReload,
          inlineStylesExtension: platformOptions.inlineStylesExtension,
          fileReplacements: platformOptions.fileReplacements,
          fastCompile: platformOptions.fastCompile,
          fastCompileMode: platformOptions.fastCompileMode,
          ...(opts?.vite ?? {}),
        })) as any),
    serverModePlugin(),
    ssrXhrBuildPlugin() as Plugin,
    clearClientPageEndpointsPlugin() as Plugin,
    ...(platformOptions.i18n ? [i18nDefRegistryPlugin()] : []),
    ...(platformOptions.i18n?.extract
      ? [i18nExtractPlugin(platformOptions.i18n)]
      : []),
  ];
}
