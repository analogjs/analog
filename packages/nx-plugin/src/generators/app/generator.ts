import {
  formatFiles,
  getWorkspaceLayout,
  installPackagesTask,
  names,
  offsetFromRoot as determineOffsetFromRoot,
  stripIndents,
  Tree,
  addDependenciesToPackageJson,
} from '@nx/devkit';
import { AnalogNxApplicationGeneratorOptions } from './schema';
import { major, coerce } from 'semver';
import { getInstalledPackageVersion } from '../../utils/version-utils';
import { addHomePage } from './lib/add-home-page';
import {
  belowMinimumSupportedNxVersion,
  belowMinimumSupportedNxtRPCVersion,
} from './versions/minimum-supported-versions';
import { addAngularApp } from './lib/add-angular-app';
import setupAnalogGenerator from '../init/generator';
import { addFiles } from './lib/add-files';
import { addTailwindConfig } from './lib/add-tailwind-config';
import { addTrpc } from './lib/add-trpc';
import { cleanupFiles } from './lib/cleanup-files';

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
  nxVersion: string,
): NormalizedOptions {
  const isNx = tree.exists('/nx.json');
  const appsDir = isNx ? getWorkspaceLayout(tree).appsDir : 'projects';
  const allNames = names(options.analogAppName);
  const projectDirectory = allNames.fileName;
  const projectName = projectDirectory.replace(new RegExp('/', 'g'), '-');
  const projectRoot = `${appsDir}/${projectDirectory}`;
  const parsedTags = options.tags
    ? options.tags.split(',').map((s) => s.trim())
    : [];
  const offsetFromRoot = determineOffsetFromRoot(projectRoot);
  const nxPackageNamespace = major(nxVersion) >= 16 ? '@nx' : '@nrwl';
  const addTailwind = options.addTailwind ?? true;
  const addTRPC = options.addTRPC ?? false;

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
    addTailwind,
    addTRPC,
  };
}

export async function appGenerator(
  tree: Tree,
  options: AnalogNxApplicationGeneratorOptions,
) {
  const nxVersion = getInstalledPackageVersion(tree, 'nx');

  if (nxVersion && belowMinimumSupportedNxVersion(nxVersion)) {
    throw new Error(
      stripIndents`Nx v15.2.0 or newer is required to install Analog`,
    );
  }

  if (belowMinimumSupportedNxtRPCVersion(nxVersion) && options.addTRPC) {
    console.warn(
      'Nx v16.1.0 or newer is required to use tRPC with Analog. Skipping installation.',
    );
    options.addTRPC = false;
  }

  const normalizedOptions = normalizeOptions(tree, options, nxVersion);
  await addAngularApp(tree, normalizedOptions);

  const angularVersion = getInstalledPackageVersion(tree, '@angular/core');
  const majorAngularVersion = major(coerce(angularVersion));
  await setupAnalogGenerator(tree, {
    project: normalizedOptions.analogAppName,
    vitest: true,
  });

  addFiles(tree, normalizedOptions, majorAngularVersion);
  addDependenciesToPackageJson(
    tree,
    {
      '@angular/platform-server': angularVersion,
      'front-matter': '^4.0.2',
      marked: '^15.0.7',
      mermaid: '^10.2.4',
      prismjs: '^1.29.0',
    },
    {},
  );

  if (normalizedOptions.addTailwind) {
    await addTailwindConfig(tree, normalizedOptions.projectName);
  }

  if (normalizedOptions.addTRPC) {
    await addTrpc(
      tree,
      normalizedOptions.projectRoot,
      nxVersion,
      normalizedOptions,
    );
  }

  addHomePage(tree, normalizedOptions, majorAngularVersion);

  cleanupFiles(tree, normalizedOptions);

  if (!normalizedOptions.skipFormat) {
    await formatFiles(tree);
  }

  return () => {
    installPackagesTask(tree);
  };
}

export default appGenerator;
