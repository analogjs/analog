import { NormalizedOptions } from '../generator';
import type { ProjectConfiguration, Tree } from '@nrwl/devkit';
import { addProjectConfiguration } from '@nrwl/devkit';

export function createProject(
  tree: Tree,
  normalizedOptions: NormalizedOptions
) {
  const projectConfiguration: ProjectConfiguration = {
    root: normalizedOptions.projectRoot,
    projectType: 'application',
    sourceRoot: `${normalizedOptions.projectRoot}/src`,
    // todo: do we want a custom executor hiding most of this?
    // targets: {
    //   build: {
    //     executor: '@analogjs/nx:build',
    //   },
    // },
    targets: {
      build: {
        executor: '@nrwl/vite:build',
        outputs: [
          '{options.outputPath}',
          `dist/apps/${normalizedOptions.projectName}/.nitro`,
          `dist/apps/${normalizedOptions.projectName}/ssr`,
          `dist/apps/${normalizedOptions.projectName}/analog`,
        ],
        options: {
          configFile: 'vite.config.ts',
          outputPath: `dist/apps/${normalizedOptions.projectName}/client`,
        },
        defaultConfiguration: 'production',
        configurations: {
          development: {
            mode: 'development',
          },
          production: {
            sourcemap: false,
            mode: 'production',
          },
        },
      },
      serve: {
        executor: '@nrwl/vite:dev-server',
        defaultConfiguration: 'development',
        options: {
          buildTarget: `${normalizedOptions.projectName}:build`,
          port: 4200,
        },
        configurations: {
          development: {
            buildTarget: `${normalizedOptions.projectName}:build:development`,
            hmr: true,
          },
          production: {
            buildTarget: `${normalizedOptions.projectName}:build:production`,
          },
        },
      },
      'build-ng': {
        executor: '@angular-devkit/build-angular:browser',
        outputs: ['{options.outputPath}'],
        options: {
          outputPath: `dist/apps/${normalizedOptions.projectName}`,
          index: `apps/${normalizedOptions.projectName}/src/index.html`,
          main: `apps/${normalizedOptions.projectName}/src/main.ts`,
          polyfills: ['zone.js'],
          tsConfig: `apps/${normalizedOptions.projectName}/tsconfig.app.json`,
          assets: [
            `apps/${normalizedOptions.projectName}/src/favicon.ico`,
            `apps/${normalizedOptions.projectName}/src/assets`,
          ],
          styles: [`apps/${normalizedOptions.projectName}/src/styles.css`],
          scripts: [],
        },
        configurations: {
          production: {
            budgets: [
              {
                type: 'initial',
                maximumWarning: '500kb',
                maximumError: '1mb',
              },
              {
                type: 'anyComponentStyle',
                maximumWarning: '2kb',
                maximumError: '4kb',
              },
            ],
            outputHashing: 'all',
          },
          development: {
            buildOptimizer: false,
            optimization: false,
            vendorChunk: true,
            extractLicenses: false,
            sourceMap: true,
            namedChunks: true,
          },
        },
        defaultConfiguration: 'production',
      },
      'serve-ng': {
        executor: '@angular-devkit/build-angular:dev-server',
        configurations: {
          production: {
            browserTarget: `${normalizedOptions.projectName}:build:production`,
          },
          development: {
            browserTarget: `${normalizedOptions.projectName}:build:development`,
          },
        },
        defaultConfiguration: 'development',
      },
      'extract-i18n': {
        executor: '@angular-devkit/build-angular:extract-i18n',
        options: {
          browserTarget: `${normalizedOptions.projectName}:build`,
        },
      },
      lint: {
        executor: '@nrwl/linter:eslint',
        outputs: ['{options.outputFile}'],
        options: {
          lintFilePatterns: [
            `apps/${normalizedOptions.projectName}/**/*.ts`,
            `apps/${normalizedOptions.projectName}/**/*.html`,
          ],
        },
      },
      test: {
        executor: '@nrwl/jest:jest',
        outputs: ['{workspaceRoot}/coverage/{projectRoot}'],
        options: {
          jestConfig: `apps/${normalizedOptions.projectName}/jest.config.ts`,
          passWithNoTests: true,
        },
        configurations: {
          ci: {
            ci: true,
            codeCoverage: true,
          },
        },
      },
    },
    tags: normalizedOptions.parsedTags,
  };

  addProjectConfiguration(tree, normalizedOptions.name, projectConfiguration);
}
