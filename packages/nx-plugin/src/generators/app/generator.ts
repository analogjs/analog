import {
  addDependenciesToPackageJson,
  formatFiles,
  generateFiles,
  getWorkspaceLayout,
  names,
  offsetFromRoot,
  stripIndents,
  Tree,
} from '@nrwl/devkit';
import * as path from 'path';
import { AnalogNxApplicationGeneratorOptions } from './schema';
import { lt, major } from 'semver';
import { getInstalledAngularVersion } from '../../utils/version-utils';
import { runTasksInSerial } from '@nrwl/workspace/src/utilities/run-tasks-in-serial';
import { addAnalogProjectConfig } from './lib/add-analog-project-config';

export interface NormalizedOptions extends AnalogNxApplicationGeneratorOptions {
  projectName: string;
  projectRoot: string;
  projectDirectory: string;
  parsedTags: string[];
}

function normalizeOptions(
  tree: Tree,
  options: AnalogNxApplicationGeneratorOptions
): NormalizedOptions {
  const name = names(options.name).fileName;
  const projectDirectory = options.directory
    ? `${names(options.directory).fileName}/${name}`
    : name;
  const projectName = projectDirectory.replace(new RegExp('/', 'g'), '-');
  const projectRoot = `${getWorkspaceLayout(tree).appsDir}/${projectDirectory}`;
  const parsedTags = options.tags
    ? options.tags.split(',').map((s) => s.trim())
    : [];

  return {
    ...options,
    projectName,
    projectRoot,
    projectDirectory,
    parsedTags,
  };
}

async function addDependencies(tree: Tree, majorAngularVersion: number) {
  const {
    dependencies,
    devDependencies,
    // eslint-disable-next-line @typescript-eslint/no-var-requires
  } = require(`./files/v${majorAngularVersion}-package.json`);
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
    ...names(options.name),
    offsetFromRoot: offsetFromRoot(options.projectRoot),
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

  await formatFiles(tree);
}
