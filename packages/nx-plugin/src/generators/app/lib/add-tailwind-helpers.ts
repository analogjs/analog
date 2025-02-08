import { checkAndCleanWithSemver } from '@nx/devkit/src/utils/semver';
import { getTailwindDependencies } from '../versions/tailwind-dependencies';
import { lt } from 'semver';
import {
  Tree,
  readJson,
  addDependenciesToPackageJson,
  GeneratorCallback,
  ProjectConfiguration,
  joinPathFragments,
  stripIndents,
  updateProjectConfiguration,
  generateFiles,
} from '@nx/devkit';
import {
  GeneratorOptions,
  NormalizedGeneratorOptions,
} from './add-tailwind-config';
import { relative } from 'node:path';

export function normalizeOptions(
  options: GeneratorOptions,
): NormalizedGeneratorOptions {
  return {
    ...options,
    buildTarget: options.buildTarget || 'build',
  };
}

export function detectTailwindInstalledVersion(
  tree: Tree,
): '2' | '3' | undefined {
  const { dependencies, devDependencies } = readJson(tree, 'package.json');
  const tailwindVersion =
    dependencies?.tailwindcss ?? devDependencies?.tailwindcss;

  if (!tailwindVersion) {
    return undefined;
  }

  const version = checkAndCleanWithSemver('tailwindcss', tailwindVersion);
  if (lt(version, '2.0.0')) {
    throw new Error(
      `The Tailwind CSS version "${tailwindVersion}" is not supported. Please upgrade to v2.0.0 or higher.`,
    );
  }

  return lt(version, '3.0.0') ? '2' : '3';
}

export function addTailwindRequiredPackages(tree: Tree): GeneratorCallback {
  const pkgVersions = getTailwindDependencies();
  return addDependenciesToPackageJson(
    tree,
    {},
    {
      autoprefixer: pkgVersions.autoprefixer,
      postcss: pkgVersions.postcss,
      tailwindcss: pkgVersions.tailwindcss,
    },
  );
}

export function updateApplicationStyles(
  tree: Tree,
  options: NormalizedGeneratorOptions,
  project: ProjectConfiguration,
): void {
  let stylesEntryPoint = options.stylesEntryPoint;

  if (stylesEntryPoint && !tree.exists(stylesEntryPoint)) {
    throw new Error(
      `The provided styles entry point "${stylesEntryPoint}" could not be found.`,
    );
  }

  if (!stylesEntryPoint) {
    stylesEntryPoint = findStylesEntryPoint(tree, options, project);

    if (!stylesEntryPoint) {
      throw new Error(
        stripIndents`Could not find a styles entry point for project "${options.project}".
        Please specify a styles entry point using the "--stylesEntryPoint" option.`,
      );
    }
  }

  const stylesEntryPointContent = tree.read(stylesEntryPoint, 'utf-8');
  tree.write(
    stylesEntryPoint,
    stripIndents`@tailwind base;
    @tailwind components;
    @tailwind utilities;

    ${stylesEntryPointContent}`,
  );
}

function findStylesEntryPoint(
  tree: Tree,
  options: NormalizedGeneratorOptions,
  project: ProjectConfiguration,
): string | undefined {
  // first check for common names
  const possibleStylesEntryPoints = [
    joinPathFragments(project.sourceRoot ?? project.root, 'styles.css'),
    joinPathFragments(project.sourceRoot ?? project.root, 'styles.scss'),
    joinPathFragments(project.sourceRoot ?? project.root, 'styles.sass'),
    joinPathFragments(project.sourceRoot ?? project.root, 'styles.less'),
  ];

  const stylesEntryPoint = possibleStylesEntryPoints.find((s) =>
    tree.exists(s),
  );
  if (stylesEntryPoint) {
    return stylesEntryPoint;
  }

  // then check for the specified styles in the build configuration if it exists
  const styles: Array<string | { input: string; inject: boolean }> =
    project.targets?.[options.buildTarget].options?.styles;

  if (!styles) {
    return undefined;
  }

  // find the first style that belongs to the project source
  const style = styles.find((s) =>
    typeof s === 'string'
      ? s.startsWith(project.root) && tree.exists(s)
      : s.input.startsWith(project.root) &&
        s.inject !== false &&
        tree.exists(s.input),
  );

  if (!style) {
    return undefined;
  }

  return typeof style === 'string' ? style : style.input;
}

export function addTailwindConfigPathToProject(
  tree: Tree,
  options: NormalizedGeneratorOptions,
  project: ProjectConfiguration,
): void {
  const buildTarget = project.targets?.[options.buildTarget];

  if (!buildTarget) {
    throw new Error(
      stripIndents`The target "${options.buildTarget}" was not found for project "${options.project}".
      If you are using a different build target, please provide it using the "--buildTarget" option.
      If the project is not a buildable or publishable library, you don't need to setup TailwindCSS for it.`,
    );
  }

  if (
    buildTarget.options?.tailwindConfig &&
    tree.exists(buildTarget.options.tailwindConfig)
  ) {
    throw new Error(
      stripIndents`The "${buildTarget.options.tailwindConfig}" file is already configured for the project "${options.project}". Are you sure this is the right project to set up Tailwind?
      If you are sure, you can remove the configuration and re-run the generator.`,
    );
  }

  const tailwindInstalledVersion = detectTailwindInstalledVersion(tree);

  if (tailwindInstalledVersion === '2') {
    buildTarget.options = {
      ...buildTarget.options,
      tailwindConfig: joinPathFragments(project.root, 'tailwind.config.js'),
    };
  } else {
    buildTarget.options = {
      ...buildTarget.options,
      tailwindConfig: joinPathFragments(project.root, 'tailwind.config.ts'),
    };
  }

  updateProjectConfiguration(tree, options.project, project);
}

export function addTailwindConfigFile(
  tree: Tree,
  options: GeneratorOptions,
  project: ProjectConfiguration,
): void {
  if (tree.exists(joinPathFragments(project.root, 'tailwind.config.js'))) {
    throw new Error(
      stripIndents`The "tailwind.config" file already exists in the project "${options.project}". Are you sure this is the right project to set up Tailwind?
      If you are sure, you can remove the existing file and re-run the generator.`,
    );
  }

  const tailwindInstalledVersion = detectTailwindInstalledVersion(tree);

  if (tailwindInstalledVersion === '2') {
    generateFiles(
      tree,
      joinPathFragments(__dirname, '..', 'files', 'tailwind/v2'),
      project.root,
      {
        relativeSourceRoot: relative(project.root, project.sourceRoot),
        template: '',
      },
    );
    return;
  }

  generateFiles(
    tree,
    joinPathFragments(__dirname, '..', 'files', 'tailwind/latest'),
    project.root,
    {
      relativeSourceRoot: relative(project.root, project.sourceRoot),
      template: '',
    },
  );
}
