import { getWorkspaceLayout, Tree } from '@nx/devkit';
import { NormalizedOptions } from '../generator';
import type { Schema } from '@nx/angular/src/generators/application/schema';
import { UnitTestRunner } from '@nx/angular/generators';

export async function addAngularApp(tree: Tree, options: NormalizedOptions) {
  const isNx = tree.exists('/nx.json');
  const appsDir = isNx ? getWorkspaceLayout(tree).appsDir : 'projects';

  const appOptions: Partial<Schema> = {
    name: options.analogAppName,
    directory: `${appsDir}/${options.analogAppName}`,
    linter: !isNx || process.env['NODE_ENV'] === 'test' ? 'none' : 'eslint',
    unitTestRunner: 'vitest' as UnitTestRunner,
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
  ).applicationGenerator(tree, appOptions);
}
