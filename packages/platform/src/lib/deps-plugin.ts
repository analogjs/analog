import { VERSION } from '@angular/compiler-cli';
import type { Plugin } from 'vite';
import { crawlFrameworkPkgs } from 'vitefu';

import { Options } from './options.js';
import { getJsTransformConfigKey } from './utils/rolldown.js';

export function depsPlugin(options?: Options): Plugin[] {
  const workspaceRoot = options?.workspaceRoot ?? process.cwd();
  const viteOptions = options?.vite === false ? undefined : options?.vite;

  return [
    {
      name: 'analogjs-deps-plugin',
      config() {
        const useAngularCompilationAPI =
          options?.experimental?.useAngularCompilationAPI ??
          viteOptions?.experimental?.useAngularCompilationAPI;

        const transformConfig =
          options?.vite === false || useAngularCompilationAPI
            ? {}
            : { exclude: ['**/*.ts', '**/*.js'] };

        return {
          [getJsTransformConfigKey()]: transformConfig,
          ssr: {
            noExternal: [
              '@analogjs/**',
              'firebase/**',
              'firebase-admin/**',
              'rxfire',
              '@ng-web-apis/**',
              '@taiga-ui/**',
              '@tanstack/angular-query-experimental',
            ],
          },
          optimizeDeps: {
            include: [
              '@angular/common',
              '@angular/common/http',
              ...(Number(VERSION.major) > 15
                ? ['@angular/core/rxjs-interop']
                : []),
              'front-matter',
            ],
            exclude: [
              '@angular/platform-server',
              '@analogjs/content',
              '@analogjs/router',
              '@nx/angular',
              '@nx/vite',
              '@nx/devkit',
              '@nx/js',
              '@nx/devkit',
              '@nx/cypress',
              '@nx/jest',
              '@nx/js',
              '@nx/eslint',
              '@nx/webpack',
              '@nx/web',
              '@nx/workspace',
              '@nx/eslint',
              '@nx/module-federation',
              '@nx/rspack',
              'webpack',
              'fsevents',
              'nx',
            ],
          },
        };
      },
    },
    {
      name: 'analogjs-auto-discover-deps',
      async config(config, { command }) {
        const pkgConfig = await crawlFrameworkPkgs({
          root: workspaceRoot,
          isBuild: command === 'build',
          viteUserConfig: config,
          isSemiFrameworkPkgByJson(pkgJson) {
            return pkgJson['module'] && pkgJson['module'].includes('fesm');
          },
        });
        return pkgConfig;
      },
    },
  ];
}
