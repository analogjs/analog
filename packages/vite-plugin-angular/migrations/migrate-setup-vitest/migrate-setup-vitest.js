'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

const schematics_1 = require('@angular-devkit/schematics');
const tasks_1 = require('@angular-devkit/schematics/tasks');

const OLD_IMPORT = '@analogjs/vite-plugin-angular/setup-vitest';
const NEW_IMPORT = '@analogjs/vitest-angular/setup-zone';

function migrateSetupVitest() {
  return (tree, context) => {
    const filesToUpdate = [];

    tree.visit((filePath) => {
      if (!filePath.endsWith('.ts') && !filePath.endsWith('.mts')) {
        return;
      }
      if (filePath.includes('/node_modules/')) {
        return;
      }

      const content = tree.read(filePath);
      if (!content) {
        return;
      }

      const text = content.toString('utf-8');
      if (text.includes(OLD_IMPORT)) {
        const updated = text.replace(
          new RegExp(OLD_IMPORT.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
          NEW_IMPORT,
        );
        tree.overwrite(filePath, updated);
        filesToUpdate.push(filePath);
      }
    });

    if (filesToUpdate.length > 0) {
      context.logger.info(
        `Migrated ${filesToUpdate.length} file(s) from '${OLD_IMPORT}' to '${NEW_IMPORT}':`,
      );
      for (const file of filesToUpdate) {
        context.logger.info(`  - ${file}`);
      }
    }

    addVitestAngularDependency(tree, context);

    return tree;
  };
}

function addVitestAngularDependency(tree, context) {
  const pkgPath = '/package.json';
  const content = tree.read(pkgPath);
  if (!content) {
    return;
  }

  const pkg = JSON.parse(content.toString('utf-8'));
  const devDeps = pkg['devDependencies'] || {};
  const deps = pkg['dependencies'] || {};

  if (
    !devDeps['@analogjs/vitest-angular'] &&
    !deps['@analogjs/vitest-angular']
  ) {
    const analogVersion =
      devDeps['@analogjs/vite-plugin-angular'] ||
      deps['@analogjs/vite-plugin-angular'] ||
      '*';

    pkg['devDependencies'] = {
      ...devDeps,
      '@analogjs/vitest-angular': analogVersion,
    };

    tree.overwrite(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
    context.addTask(new tasks_1.NodePackageInstallTask());
    context.logger.info(
      `Added '@analogjs/vitest-angular': '${analogVersion}' to devDependencies.`,
    );
  }
}

exports.default = migrateSetupVitest;
module.exports = migrateSetupVitest;
