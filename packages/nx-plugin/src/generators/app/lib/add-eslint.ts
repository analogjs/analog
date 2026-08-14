import { Tree } from '@nx/devkit';
import { NormalizedOptions } from '../generator';

export async function addEslint(
  tree: Tree,
  majorNxVersion: number,
  options: NormalizedOptions,
): Promise<void> {
  const linterOptions = {
    // needed to not depend on linter package
    linter: 'eslint' as any,
    project: options.projectName,
    eslintFilePatterns: [`${options.projectRoot}/**/*.{ts,html}`],
    skipFormat: true,
  };

  await (
    await import(
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      '@nx/eslint'
    )
  ).lintProjectGenerator(tree, linterOptions);
}
