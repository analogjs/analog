import { Tree } from '@nrwl/devkit';
import { PresetGeneratorSchema } from './schema';

export default async function (tree: Tree, options: PresetGeneratorSchema) {
  return await import('../app/generator').then(({ appGenerator }) =>
    appGenerator(tree, options)
  );
}
