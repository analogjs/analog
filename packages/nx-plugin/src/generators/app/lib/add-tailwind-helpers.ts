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
} from '@nx/devkit';
import {
  GeneratorOptions,
  NormalizedGeneratorOptions,
} from './add-tailwind-config';

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
): '4' | '5' | undefined {
  const { dependencies, devDependencies } = readJson(tree, 'package.json');
  const tailwindVersion =
    dependencies?.tailwindcss ?? devDependencies?.tailwindcss;

  if (!tailwindVersion) {
    return undefined;
  }

  const version = checkAndCleanWithSemver('tailwindcss', tailwindVersion);
  if (lt(version, '4.0.0')) {
    throw new Error(
      `The Tailwind CSS version "${tailwindVersion}" is not supported. Please upgrade to v4.0.0 or higher.`,
    );
  }
  return lt(version, '5.0.0') ? '4' : '5';
}

export function addTailwindRequiredPackages(tree: Tree): GeneratorCallback {
  const pkgVersions = getTailwindDependencies();
  return addDependenciesToPackageJson(
    tree,
    {
      postcss: pkgVersions.postcss,
      tailwindcss: pkgVersions.tailwindcss,
      '@tailwindcss/postcss': pkgVersions['@tailwindcss/postcss'],
      '@tailwindcss/vite': pkgVersions['@tailwindcss/vite'],
    },
    {},
  );
}

export function writeTailwindPostcssConfig(
  tree: Tree,
  project: ProjectConfiguration,
): void {
  const postcssConfigPath = joinPathFragments(
    project.root,
    'postcss.config.mjs',
  );

  if (tree.exists(postcssConfigPath)) {
    return;
  }

  tree.write(
    postcssConfigPath,
    `export default {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};
`,
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

  if (!stylesEntryPoint.endsWith('.css')) {
    throw new Error(
      `Tailwind CSS v4 is not compatible with any css preprocessors like sass or less. Please use a css file as the styles entry point.`,
    );
  }

  const stylesEntryPointContent = tree.read(stylesEntryPoint, 'utf-8');

  tree.write(
    stylesEntryPoint,
    stripIndents`@import "tailwindcss";


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
