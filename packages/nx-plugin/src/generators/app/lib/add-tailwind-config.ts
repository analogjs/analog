import {
  formatFiles,
  GeneratorCallback,
  readProjectConfiguration,
  Tree,
} from '@nx/devkit';
import {
  addTailwindRequiredPackages,
  detectTailwindInstalledVersion,
  normalizeOptions,
  updateApplicationStyles,
  writeTailwindPostcssConfig,
} from './add-tailwind-helpers';

export async function addTailwindConfig(
  tree: Tree,
  projectName: string,
): Promise<void> {
  await setupTailwindGenerator(tree, {
    project: projectName,
  });
}

export interface GeneratorOptions {
  project: string;
  buildTarget?: string;
  skipFormat?: boolean;
  stylesEntryPoint?: string;
  skipPackageJson?: boolean;
}

export interface NormalizedGeneratorOptions extends GeneratorOptions {
  buildTarget: string;
}

export async function setupTailwindGenerator(
  tree: Tree,
  rawOptions: GeneratorOptions,
): Promise<GeneratorCallback> {
  const options = normalizeOptions(rawOptions);
  const project = readProjectConfiguration(tree, options.project);

  // TODO: use return value for v5+ branching when needed
  detectTailwindInstalledVersion(tree);

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  let installTask: GeneratorCallback = () => {};
  if (!options.skipPackageJson) {
    installTask = addTailwindRequiredPackages(tree);
  }

  if (project.projectType === 'application') {
    updateApplicationStyles(tree, options, project);
    writeTailwindPostcssConfig(tree, project);
  }

  if (!options.skipFormat) {
    await formatFiles(tree);
  }

  return installTask;
}
