import {
  formatFiles,
  GeneratorCallback,
  readProjectConfiguration,
  Tree,
} from '@nx/devkit';
import {
  addTailwindConfigFile,
  addTailwindConfigPathToProject,
  addTailwindRequiredPackages,
  detectTailwindInstalledVersion,
  normalizeOptions,
  updateApplicationStyles,
} from './add-tailwind-helpers';

export async function addTailwindConfig(tree: Tree, projectName: string) {
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

  const tailwindInstalledVersion = detectTailwindInstalledVersion(tree);

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  let installTask: GeneratorCallback = () => {};
  if (!options.skipPackageJson) {
    if (tailwindInstalledVersion === undefined) {
      installTask = addTailwindRequiredPackages(tree);
    }
  }

  addTailwindConfigFile(tree, options, project);

  if (project.projectType === 'application') {
    updateApplicationStyles(tree, options, project);
  } else if (project.projectType === 'library') {
    addTailwindConfigPathToProject(tree, options, project);
  }

  if (!options.skipFormat) {
    await formatFiles(tree);
  }

  return installTask;
}
