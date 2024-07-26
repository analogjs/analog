import { VERSION } from '@angular/compiler-cli';
import { Plugin } from 'vite';
import { crawlFrameworkPkgs } from 'vitefu';
import { relative } from 'node:path';

import { Options } from './options.js';

export function depsPlugin(options?: Options): Plugin[] {
  const workspaceRoot = options?.workspaceRoot ?? process.cwd();

  return [
    {
      name: 'analogjs-deps-plugin',
      config() {
        return {
          ssr: {
            noExternal: ['@analogjs/**', 'firebase/**', 'firebase-admin/**'],
          },
          optimizeDeps: {
            include: [
              '@angular/common',
              '@angular/common/http',
              ...(Number(VERSION.major) > 15
                ? ['@angular/core/rxjs-interop']
                : []),
            ],
            exclude: [
              '@angular/platform-server',
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
              'webpack',
            ],
          },
        };
      },
    },
    {
      name: 'analogjs-auto-discover-deps',
      async config(config, { command }) {
        const root = relative(workspaceRoot, config.root || '.') || '.';

        const pkgConfig = await crawlFrameworkPkgs({
          root,
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
