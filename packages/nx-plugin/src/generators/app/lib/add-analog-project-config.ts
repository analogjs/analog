import type { ProjectConfiguration, Tree } from '@nx/devkit';
import { addProjectConfiguration } from '@nx/devkit';

export function addAnalogProjectConfig(
  tree: Tree,
  projectRoot: string,
  projectName: string,
  parsedTags: string[],
  name: string
) {
  const projectConfiguration: ProjectConfiguration = {
    root: projectRoot,
    projectType: 'application',
    sourceRoot: `${projectRoot}/src`,
    targets: {
      build: {
        executor: '@nx/vite:build',
        outputs: [
          '{options.outputPath}',
          `dist/apps/${projectName}/.nitro`,
          `dist/apps/${projectName}/ssr`,
          `dist/apps/${projectName}/analog`,
        ],
        options: {
          configFile: 'vite.config.ts',
          outputPath: `dist/apps/${projectName}/client`,
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
        executor: '@nx/vite:dev-server',
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
        executor: '@angular-devkit/build-angular:extract-i18n',
        options: {
          browserTarget: `${projectName}:build`,
        },
      },
      lint: {
        executor: '@nx/linter:eslint',
        outputs: ['{options.outputFile}'],
        options: {
          lintFilePatterns: [
            `apps/${projectName}/**/*.ts`,
            `apps/${projectName}/**/*.html`,
          ],
        },
      },
      test: {
        executor: '@nx/vite:test',
        outputs: [`apps/${projectName}/coverage`],
      },
    },
    tags: parsedTags,
  };

  addProjectConfiguration(tree, name, projectConfiguration);
}
