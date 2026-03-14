import type { ProjectConfiguration, Tree } from '@nx/devkit';
import { addProjectConfiguration, getProjects, updateJson } from '@nx/devkit';

export function addAnalogProjectConfig(
  tree: Tree,
  projectRoot: string,
  projectName: string,
  parsedTags: string[],
  name: string,
  appsDir: string,
  nxPackageNamespace: string,
) {
  const isStandalone = appsDir === '.';
  const isNx = tree.exists('/nx.json');
  const workspaceAppsDir = isStandalone || !isNx ? '' : `${appsDir}/`;

  if (isNx) {
    const projectConfiguration: ProjectConfiguration = {
      root: projectRoot,
      projectType: 'application',
      sourceRoot: `${projectRoot}/src`,
      tags: parsedTags,
      targets: {
        build: {
          executor: '@analogjs/platform:vite',
          outputs: [
            '{options.outputPath}',
            `{workspaceRoot}/dist/${workspaceAppsDir}${projectName}/.nitro`,
            `{workspaceRoot}/dist/${workspaceAppsDir}${projectName}/ssr`,
            `{workspaceRoot}/dist/${workspaceAppsDir}${projectName}/analog`,
          ],
          options: {
            main: `${workspaceAppsDir}${projectName}/src/main.ts`,
            configFile: `${workspaceAppsDir}${projectName}/vite.config.ts`,
            outputPath: `dist/${workspaceAppsDir}${projectName}/client`,
            tsConfig: `${workspaceAppsDir}${projectName}/tsconfig.app.json`,
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
          executor: '@analogjs/platform:vite-dev-server',
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
        test: {
          executor: '@analogjs/vitest-angular:test',
          outputs: [`{projectRoot}/coverage`],
        },
      },
    };

    addProjectConfiguration(tree, name, projectConfiguration);
  } else {
    const projects = getProjects(tree);
    const fetched = projects.get(projectName);

    if (!fetched) {
      throw new Error(`Project "${projectName}" not found in workspace.`);
    }

    const {
      targets,
      $schema,
      name: _name,
      generators,
      'extract-i18n': _,
      'serve-static': __,
      ...rest
    } = fetched as ProjectConfiguration & Record<string, unknown>;

    const {
      'extract-i18n': _ei,
      'serve-static': _ss,
      ...architect
    } = targets ?? {};

    updateJson(tree, '/angular.json', (json) => {
      json.projects[projectName] = {
        ...rest,
        architect,
        tags: parsedTags,
      };

      return json;
    });
  }
}
