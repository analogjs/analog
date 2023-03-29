import {
  addDependenciesToPackageJson,
  formatFiles,
  generateFiles,
  getWorkspaceLayout,
  names,
  offsetFromRoot as determineOffsetFromRoot,
  stripIndents,
  Tree,
} from '@nrwl/devkit';
import * as path from 'path';
import { AnalogNxApplicationGeneratorOptions } from './schema';
import { lt, major } from 'semver';
import { getInstalledAngularVersion } from '../../utils/version-utils';
import { runTasksInSerial } from '@nrwl/workspace/src/utilities/run-tasks-in-serial';
import { addAnalogProjectConfig } from './lib/add-analog-project-config';
import {
  V15_ANALOG_JS_CONTENT,
  V15_ANALOG_JS_PLATFORM,
  V15_ANALOG_JS_ROUTER,
  V15_ANGULAR_PLATFORM_SERVER,
  V15_FRONT_MATTER,
  V15_JSDOM,
  V15_MARKED,
  V15_NRWL_VITE,
  V15_PRISMJS,
  V15_TYPESCRIPT,
  V15_VITE,
  V15_VITE_TSCONFIG_PATHS,
  V15_VITEST,
  V16_ANALOG_JS_CONTENT,
  V16_ANALOG_JS_PLATFORM,
  V16_ANALOG_JS_ROUTER,
  V16_ANGULAR_PLATFORM_SERVER,
  V16_FRONT_MATTER,
  V16_JSDOM,
  V16_MARKED,
  V16_NRWL_VITE,
  V16_PRISMJS,
  V16_TYPESCRIPT,
  V16_VITE,
  V16_VITE_TSCONFIG_PATHS,
  V16_VITEST,
} from './files/versions';

export interface NormalizedOptions
  extends AnalogNxApplicationGeneratorOptions,
    ReturnType<typeof names> {
  projectName: string;
  projectRoot: string;
  projectDirectory: string;
  parsedTags: string[];
  offsetFromRoot: string;
}

function normalizeOptions(
  tree: Tree,
  options: AnalogNxApplicationGeneratorOptions
): NormalizedOptions {
  const allNames = names(options.name);
  const name = allNames.fileName;
  const projectDirectory = options.directory
    ? `${names(options.directory).fileName}/${name}`
    : name;
  const projectName = projectDirectory.replace(new RegExp('/', 'g'), '-');
  const projectRoot = `${getWorkspaceLayout(tree).appsDir}/${projectDirectory}`;
  const parsedTags = options.tags
    ? options.tags.split(',').map((s) => s.trim())
    : [];
  const offsetFromRoot = determineOffsetFromRoot(projectRoot);

  return {
    ...options,
    ...allNames,
    projectName,
    projectRoot,
    projectDirectory,
    parsedTags,
    offsetFromRoot,
  };
}

async function addDependencies(tree: Tree, majorAngularVersion: number) {
  const dependencies = {
    '@analogjs/content':
      majorAngularVersion === 15
        ? V15_ANALOG_JS_CONTENT
        : V16_ANALOG_JS_CONTENT,
    '@analogjs/router':
      majorAngularVersion === 15 ? V15_ANALOG_JS_ROUTER : V16_ANALOG_JS_ROUTER,
    '@angular/platform-server':
      majorAngularVersion === 15
        ? V15_ANGULAR_PLATFORM_SERVER
        : V16_ANGULAR_PLATFORM_SERVER,
    'front-matter':
      majorAngularVersion === 15 ? V15_FRONT_MATTER : V16_FRONT_MATTER,
    marked: majorAngularVersion === 15 ? V15_MARKED : V16_MARKED,
    prismjs: majorAngularVersion === 15 ? V15_PRISMJS : V16_PRISMJS,
  };
  const devDependencies = {
    '@analogjs/platform':
      majorAngularVersion === 15
        ? V15_ANALOG_JS_PLATFORM
        : V16_ANALOG_JS_PLATFORM,
    '@nrwl/vite': majorAngularVersion === 15 ? V15_NRWL_VITE : V16_NRWL_VITE,
    jsdom: majorAngularVersion === 15 ? V15_JSDOM : V16_JSDOM,
    typescript: majorAngularVersion === 15 ? V15_TYPESCRIPT : V16_TYPESCRIPT,
    vite: majorAngularVersion === 15 ? V15_VITE : V16_VITE,
    'vite-tsconfig-paths':
      majorAngularVersion === 15
        ? V15_VITE_TSCONFIG_PATHS
        : V16_VITE_TSCONFIG_PATHS,
    vitest: majorAngularVersion === 15 ? V15_VITEST : V16_VITEST,
  };

  const installDependencies = addDependenciesToPackageJson(
    tree,
    dependencies,
    devDependencies
  );
  await runTasksInSerial(installDependencies);
}

function addFiles(
  tree: Tree,
  options: NormalizedOptions,
  majorAngularVersion: number
) {
  const templateOptions = {
    ...options,
    offsetFromRoot: options.offsetFromRoot,
    template: '',
  };
  generateFiles(
    tree,
    path.join(__dirname, 'files', 'template-angular-v' + majorAngularVersion),
    options.projectRoot,
    templateOptions
  );
}

export default async function (
  tree: Tree,
  options: AnalogNxApplicationGeneratorOptions
) {
  const installedAngularVersion = getInstalledAngularVersion(
    tree,
    '16.0.0-next.0'
  );

  const installedMajorAngularVersion = major(installedAngularVersion);

  const normalizedOptions = normalizeOptions(tree, options);

  const { projectRoot, projectName, parsedTags, name } = normalizedOptions;

  if (lt(installedAngularVersion, '15.0.0')) {
    throw new Error(
      stripIndents`AnalogJs only supports an Angular version of 15 and higher`
    );
  }

  await addDependencies(tree, installedMajorAngularVersion);

  addAnalogProjectConfig(tree, projectRoot, projectName, parsedTags, name);

  addFiles(tree, normalizedOptions, installedMajorAngularVersion);

  if (!normalizedOptions.skipFormat) {
    await formatFiles(tree);
  }
}
