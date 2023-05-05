import {
  formatFiles,
  getWorkspaceLayout,
  installPackagesTask,
  names,
  offsetFromRoot as determineOffsetFromRoot,
  stripIndents,
  Tree,
} from '@nx/devkit';
import { AnalogNxApplicationGeneratorOptions } from './schema';
import { major } from 'semver';
import { getInstalledPackageVersion } from '../../utils/version-utils';
import { addAnalogProjectConfig } from './lib/add-analog-project-config';
import { addAnalogDependencies } from './lib/add-analog-dependencies';
import { initializeAngularWorkspace } from './lib/initialize-analog-workspace';
import { addFiles } from './lib/add-files';
import { addTailwindConfig } from './lib/add-tailwind-config';

export interface NormalizedOptions
  extends AnalogNxApplicationGeneratorOptions,
    ReturnType<typeof names> {
  projectName: string;
  projectRoot: string;
  projectDirectory: string;
  parsedTags: string[];
  offsetFromRoot: string;
  appsDir: string;
  nxPackageNamespace: string;
}

function normalizeOptions(
  tree: Tree,
  options: AnalogNxApplicationGeneratorOptions,
  nxVersion: string
): NormalizedOptions {
  const appsDir = getWorkspaceLayout(tree).appsDir;
  const allNames = names(options.name);
  const projectDirectory = allNames.fileName;
  const projectName = projectDirectory.replace(new RegExp('/', 'g'), '-');
  const projectRoot = `${appsDir}/${projectDirectory}`;
  const parsedTags = options.tags
    ? options.tags.split(',').map((s) => s.trim())
    : [];
  const offsetFromRoot = determineOffsetFromRoot(projectRoot);
  const nxPackageNamespace = major(nxVersion) >= 16 ? '@nx' : '@nrwl';
  return {
    ...options,
    ...allNames,
    projectName,
    projectRoot,
    projectDirectory,
    parsedTags,
    offsetFromRoot,
    appsDir,
    nxPackageNamespace,
  };
}

export async function appGenerator(
  tree: Tree,
  options: AnalogNxApplicationGeneratorOptions
) {
  const nxVersion = getInstalledPackageVersion(tree, 'nx');

  if (!nxVersion) {
    throw new Error(stripIndents`Nx must be installed to execute this plugin`);
  }

  const normalizedOptions = normalizeOptions(tree, options, nxVersion);
  const angularVersion = await initializeAngularWorkspace(
    tree,
    nxVersion,
    normalizedOptions
  );
  const majorNxVersion = major(nxVersion);
  const majorAngularVersion = major(angularVersion);

  await addAnalogDependencies(tree, majorAngularVersion, majorNxVersion);

  const {
    projectRoot,
    projectName,
    parsedTags,
    name,
    appsDir,
    nxPackageNamespace,
  } = normalizedOptions;
  addAnalogProjectConfig(
    tree,
    projectRoot,
    projectName,
    parsedTags,
    name,
    appsDir,
    nxPackageNamespace
  );

  addFiles(tree, normalizedOptions, majorAngularVersion);

  if (!normalizedOptions.skipTailwind) {
    await addTailwindConfig(
      tree,
      normalizedOptions.projectRoot,
      normalizedOptions.projectName,
      majorNxVersion
    );
  }

  if (!normalizedOptions.skipFormat) {
    await formatFiles(tree);
  }

  return () => {
    installPackagesTask(tree);
  };
}

export default appGenerator;
