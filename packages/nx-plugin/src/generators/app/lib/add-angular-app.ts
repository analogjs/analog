import { createRequire } from 'node:module';
import { getWorkspaceLayout, Tree } from '@nx/devkit';
import { NormalizedOptions } from '../generator';

export async function addAngularApp(
  tree: Tree,
  options: NormalizedOptions,
): Promise<void> {
  const isNx = tree.exists('/nx.json');
  const appsDir = isNx ? getWorkspaceLayout(tree).appsDir : 'projects';

  let generators: typeof import('@nx/angular/generators');
  try {
    generators = await import('@nx/angular/generators');
  } catch (error) {
    // Nx's ensurePackage registers packages on NODE_PATH, which Node's ESM loader ignores.
    try {
      generators = createRequire(__filename)('@nx/angular/generators');
    } catch {
      throw error;
    }
  }

  const { applicationGenerator } = generators;
  type ApplicationSchema = Parameters<typeof applicationGenerator>[1];
  const appOptions: ApplicationSchema = {
    name: options.analogAppName,
    directory: `${appsDir}/${options.analogAppName}`,
    linter: !isNx
      ? 'none'
      : (options.linter ??
        (process.env['NODE_ENV'] === 'test' ? 'none' : 'eslint')),
    // Analog sets up its own Vitest configuration in the init generator, so the
    // Angular generator should not scaffold a test runner. Nx 23 also removed
    // the `'vitest'` option in favour of `'vitest-angular'`/`'vitest-analog'`.
    unitTestRunner: 'none' as ApplicationSchema['unitTestRunner'],
    standalone: true,
    ssr: false,
    bundler: 'esbuild',
    skipFormat: true,
    tags: options.tags,
  };

  await applicationGenerator(tree, appOptions);
}
