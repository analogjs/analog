import { getWorkspaceLayout, Tree } from '@nx/devkit';
// `@nx/angular` exposes its generators only through its `exports` map, which
// this project's classic `node` module resolution does not consult. Reference
// the built declaration directly so the type resolves; the runtime entry is
// imported below via `@nx/angular/generators`.
import type { applicationGenerator } from '@nx/angular/dist/generators';
import { NormalizedOptions } from '../generator';

export async function addAngularApp(tree: Tree, options: NormalizedOptions) {
  const isNx = tree.exists('/nx.json');
  const appsDir = isNx ? getWorkspaceLayout(tree).appsDir : 'projects';

  type ApplicationSchema = Parameters<typeof applicationGenerator>[1];
  const appOptions: ApplicationSchema = {
    name: options.analogAppName,
    directory: `${appsDir}/${options.analogAppName}`,
    linter: !isNx || process.env['NODE_ENV'] === 'test' ? 'none' : 'eslint',
    // Analog sets up its own Vitest configuration in the init generator, so the
    // Angular generator should not scaffold a test runner. Nx 23 also removed
    // the `'vitest'` option in favour of `'vitest-angular'`/`'vitest-analog'`.
    unitTestRunner: 'none' as ApplicationSchema['unitTestRunner'],
    standalone: true,
    ssr: false,
    bundler: 'esbuild',
    serverRouting: false,
    skipFormat: true,
    tags: options.tags,
  };

  await (
    await import(
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      '@nx/angular/generators'
    )
  ).applicationGenerator(tree, {
    ...appOptions,
    directory: `${appsDir}/${options.analogAppName}`,
  });
}
