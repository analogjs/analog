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
  const targets = isNx ? 'targets' : 'architect';
  const builders = isNx ? 'executor' : 'builder';

  let projectConfiguration: ProjectConfiguration = {
    root: projectRoot,
    projectType: 'application',
    [targets]: {
      build: {
        [builders]: `@analogjs/platform:vite`,
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
        [builders]: `@analogjs/platform:vite-dev-server`,
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
        [builders]: `@analogjs/vitest-angular:test`,
      },
    },
  };

  if (isNx) {
    projectConfiguration.targets['build'].outputs = [
      '{options.outputPath}',
      `{workspaceRoot}/dist/${workspaceAppsDir}${projectName}/.nitro`,
      `{workspaceRoot}/dist/${workspaceAppsDir}${projectName}/ssr`,
      `{workspaceRoot}/dist/${workspaceAppsDir}${projectName}/analog`,
    ];
    projectConfiguration[targets]['build'].options = {
      main: `${workspaceAppsDir}${projectName}/src/main.ts`,
      configFile: `${workspaceAppsDir}${projectName}/vite.config.ts`,
      outputPath: `dist/${workspaceAppsDir}${projectName}/client`,
      tsConfig: `${workspaceAppsDir}${projectName}/tsconfig.app.json`,
    };
    projectConfiguration[targets]['test'].outputs = [`{projectRoot}/coverage`];
    projectConfiguration[targets]['extract-i18n'] = undefined;
    projectConfiguration[targets]['serve-static'] = undefined;
    projectConfiguration.tags = parsedTags;
    projectConfiguration.sourceRoot = `${projectRoot}/src`;
  } else {
    const projects = getProjects(tree);

    projectConfiguration = projects.get(projectName);
    projectConfiguration[targets] = projectConfiguration.targets;
    projectConfiguration[targets]['extract-i18n'] = undefined;
    projectConfiguration[targets]['serve-static'] = undefined;
    projectConfiguration.tags = parsedTags;
    delete projectConfiguration['$schema'];
    delete projectConfiguration['name'];
    delete projectConfiguration['generators'];
    delete projectConfiguration['targets'];
    delete projectConfiguration[targets]['extract-i18n'];
  }

  if (isNx) {
    addProjectConfiguration(tree, name, projectConfiguration);
  } else {
    updateJson(tree, '/angular.json', (json) => {
      json.projects[projectName] = projectConfiguration;

      return json;
    });
  }
}
