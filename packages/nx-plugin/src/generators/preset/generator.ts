import { ensurePackage, NX_VERSION, Tree, updateJson } from '@nx/devkit';
import { PresetGeneratorSchema } from './schema';

export default async function (
  tree: Tree,
  options: PresetGeneratorSchema,
): Promise<() => void> {
  ensurePackage('@nx/angular', NX_VERSION);
  ensurePackage('@nx/vite', NX_VERSION);
  ensurePackage('@angular-devkit/core', 'latest');
  ensurePackage('rxjs', 'latest');

  const generatorModule = await import('../app/generator');
  const appGenerator =
    'default' in generatorModule ? generatorModule.default : generatorModule;

  const installTask = await appGenerator(tree, options);

  if (tree.exists('/tsconfig.base.json')) {
    updateJson<{
      compilerOptions?: {
        baseUrl?: string;
      };
    }>(tree, '/tsconfig.base.json', (json) => {
      delete json.compilerOptions?.baseUrl;
      return json;
    });
  }

  return installTask;
}
