import { createRequire } from 'node:module';
import { getWorkspaceLayout, Tree } from '@nx/devkit';
import { NormalizedOptions } from '../generator';

export async function loadPackage<T>(specifier: string): Promise<T> {
  try {
    return (await import(specifier)) as T;
  } catch (error) {
    // Nx's `ensurePackage` installs into a temp directory and registers it on
    // `NODE_PATH` / `Module._initPaths()`, which Node's ESM loader ignores.
    const req = createRequire(__filename);
    try {
      return req(specifier) as T;
    } catch {
      throw error;
    }
  }
}

export async function addAngularApp(
  tree: Tree,
  options: NormalizedOptions,
): Promise<void> {
  const isNx = tree.exists('/nx.json');
  const appsDir = isNx ? getWorkspaceLayout(tree).appsDir : 'projects';

  const { applicationGenerator } = await loadPackage<
    typeof import('@nx/angular/generators')
  >('@nx/angular/generators');
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
