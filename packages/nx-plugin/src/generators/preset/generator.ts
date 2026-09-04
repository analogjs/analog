import { ensurePackage, generateFiles, NX_VERSION, Tree } from '@nx/devkit';
import { join } from 'node:path';
import {
  belowMinimumSupportedOxlintNxVersion,
  MINIMUM_SUPPORTED_OXLINT_NX_VERSION,
} from '../app/versions/minimum-supported-versions';
import { PresetGeneratorSchema } from './schema';

export default async function (tree: Tree, options: PresetGeneratorSchema) {
  ensurePackage('@nx/angular', NX_VERSION);
  ensurePackage('@nx/vite', NX_VERSION);
  if (options.linter === 'oxlint') {
    if (belowMinimumSupportedOxlintNxVersion(NX_VERSION)) {
      throw new Error(
        `Nx v${MINIMUM_SUPPORTED_OXLINT_NX_VERSION} or newer is required to use the oxlint linter`,
      );
    }
    ensurePackage('@nx/oxlint', NX_VERSION);
  } else if (options.linter !== 'none') {
    ensurePackage('@nx/eslint', NX_VERSION);
  }
  ensurePackage('@angular-devkit/core', 'latest');
  ensurePackage('rxjs', 'latest');

  const appTask = await import('../app/generator').then(({ appGenerator }) =>
    appGenerator(tree, { ...options, skipAgentContext: true }),
  );

  // Seed agent context at the workspace root so AI coding assistants pick up
  // Analog conventions (see node_modules/@analogjs/platform/AGENTS.md).
  generateFiles(
    tree,
    join(__dirname, '..', 'app', 'files', 'agents'),
    '.',
    options,
  );

  return appTask;
}
