import type { ProjectConfiguration, Tree } from '@nx/devkit';
import { addProjectConfiguration } from '@nx/devkit';

export function addAnalogProjectConfig(
  tree: Tree,
  projectRoot: string,
  projectName: string,
  parsedTags: string[],
  name: string,
  appsDir: string,
  nxPackageNamespace: string
) {
  const projectConfiguration: ProjectConfiguration = {
    root: projectRoot,
    projectType: 'application',
    sourceRoot: `${projectRoot}/src`,
    targets: {
      build: {
        executor: `${nxPackageNamespace}/vite:build`,
        outputs: [
          '{options.outputPath}',
          `dist/${appsDir}/${projectName}/.nitro`,
          `dist/${appsDir}/${projectName}/ssr`,
          `dist/${appsDir}/${projectName}/analog`,
        ],
        options: {
          main: `${appsDir}/${projectName}/src/main.ts`,
          configFile: `${appsDir}/${projectName}/vite.config.ts`,
          outputPath: `dist/${appsDir}/${projectName}/client`,
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
        executor: `${nxPackageNamespace}/vite:dev-server`,
        defaultConfiguration: 'development',
        options: {
          buildTarget: `${projectName}:build`,
          port: 4200,
        },
        configurations: {
          development: {
            buildTarget: `${projectName}:build:development`,
            hmr: true,
          },
          production: {
            buildTarget: `${projectName}:build:production`,
          },
        },
      },
      'extract-i18n': {
        executor: `@angular-devkit/build-angular:extract-i18n`,
        options: {
          browserTarget: `${projectName}:build`,
        },
      },
      lint: {
        executor: `${nxPackageNamespace}/linter:eslint`,
        outputs: ['{options.outputFile}'],
        options: {
          lintFilePatterns: [
            `${appsDir}/${projectName}/**/*.ts`,
            `${appsDir}/${projectName}/**/*.html`,
          ],
        },
      },
      test: {
        executor: `${nxPackageNamespace}/vite:test`,
        outputs: [`${appsDir}/${projectName}/coverage`],
      },
    },
    tags: parsedTags,
  };

  addProjectConfiguration(tree, name, projectConfiguration);
}
