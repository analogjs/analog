import { ensurePackage, generateFiles, NX_VERSION, Tree } from '@nx/devkit';
import { join } from 'node:path';
import { PresetGeneratorSchema } from './schema';

export default async function (tree: Tree, options: PresetGeneratorSchema) {
  ensurePackage('@nx/angular', NX_VERSION);
  ensurePackage('@nx/vite', NX_VERSION);
  ensurePackage('@nx/eslint', NX_VERSION);
  ensurePackage('@angular-devkit/core', 'latest');
  ensurePackage('rxjs', 'latest');

  const appTask = await import('../app/generator').then(({ appGenerator }) =>
    appGenerator(tree, options),
  );

  // Seed agent context at the workspace root so AI coding assistants pick up
  // Analog conventions (see node_modules/@analogjs/platform/AGENTS.md).
  generateFiles(tree, join(__dirname, 'files'), '.', options);

  return appTask;
}
