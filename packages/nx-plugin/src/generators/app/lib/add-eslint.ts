import { Tree } from '@nx/devkit';
import { Linter, lintProjectGenerator } from '@nx/linter';
import { NormalizedOptions } from '../generator';

export async function addEslint(
  tree: Tree,
  options: NormalizedOptions
): Promise<void> {
  await lintProjectGenerator(tree, {
    linter: Linter.EsLint,
    project: options.projectName,
    eslintFilePatterns: [`${options.projectRoot}/**/*.{ts,html}`],
    skipFormat: true,
  });
}
