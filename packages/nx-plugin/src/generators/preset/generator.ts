import { ensurePackage, NX_VERSION, Tree } from '@nx/devkit';
import { PresetGeneratorSchema } from './schema';

export default async function (tree: Tree, options: PresetGeneratorSchema) {
  ensurePackage('@nx/angular', NX_VERSION);
  ensurePackage('@angular-devkit/build-angular', 'latest');

  return await import('../app/generator').then(({ appGenerator }) =>
    appGenerator(tree, options),
  );
}
