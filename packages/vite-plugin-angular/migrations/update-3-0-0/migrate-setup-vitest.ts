import {
  addDependenciesToPackageJson,
  readJson,
  runTasksInSerial,
  Tree,
  visitNotIgnoredFiles,
} from '@nx/devkit';

const OLD_IMPORT = '@analogjs/vite-plugin-angular/setup-vitest';
const NEW_IMPORT = '@analogjs/vitest-angular/setup-zone';
const SUPPORTED_EXTENSIONS = new Set(['.js', '.mjs', '.mts', '.ts']);

function getAnalogVersion(tree: Tree): string {
  if (!tree.exists('package.json')) {
    return '*';
  }

  const packageJson = readJson<{
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  }>(tree, 'package.json');

  return (
    packageJson.devDependencies?.['@analogjs/vite-plugin-angular'] ||
    packageJson.dependencies?.['@analogjs/vite-plugin-angular'] ||
    '*'
  );
}

export default async function migrateSetupVitest(tree: Tree) {
  const filesToUpdate: string[] = [];

  visitNotIgnoredFiles(tree, '', (filePath) => {
    const extension = filePath.slice(filePath.lastIndexOf('.'));
    if (!SUPPORTED_EXTENSIONS.has(extension)) {
      return;
    }

    const content = tree.read(filePath, 'utf-8');
    if (!content?.includes(OLD_IMPORT)) {
      return;
    }

    tree.write(filePath, content.replaceAll(OLD_IMPORT, NEW_IMPORT));
    filesToUpdate.push(filePath);
  });

  if (filesToUpdate.length === 0) {
    return;
  }

  const installTask = addDependenciesToPackageJson(
    tree,
    {},
    {
      '@analogjs/vitest-angular': getAnalogVersion(tree),
    },
    'package.json',
    true,
  );

  return runTasksInSerial(installTask);
}
