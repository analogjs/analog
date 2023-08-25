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
  const isStandalone = appsDir === '.';
  const workspaceAppsDir = isStandalone ? '' : `${appsDir}/`;
  const projectConfiguration: ProjectConfiguration = {
    root: projectRoot,
    projectType: 'application',
    sourceRoot: `${projectRoot}/src`,
    targets: {
      build: {
        executor: `${nxPackageNamespace}/vite:build`,
        outputs: [
          '{options.outputPath}',
          `dist/${workspaceAppsDir}${projectName}/.nitro`,
          `dist/${workspaceAppsDir}${projectName}/ssr`,
          `dist/${workspaceAppsDir}${projectName}/analog`,
        ],
        options: {
          main: `${workspaceAppsDir}${projectName}/src/main.ts`,
          configFile: `${workspaceAppsDir}${projectName}/vite.config.ts`,
          outputPath: `dist/${workspaceAppsDir}${projectName}/client`,
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
      test: {
        executor: `${nxPackageNamespace}/vite:test`,
        outputs: [`${workspaceAppsDir}${projectName}/coverage`],
      },
    },
    tags: parsedTags,
  };

  addProjectConfiguration(tree, name, projectConfiguration);
}
