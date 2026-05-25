import { Rule, SchematicContext, Tree } from '@angular-devkit/schematics';
import { NodePackageInstallTask } from '@angular-devkit/schematics/tasks';

const ANALOG_PLATFORM_IMPORT = `from '@analogjs/platform'`;
const ANGULAR_PLUGIN_IMPORT = `from '@analogjs/vite-plugin-angular'`;
const NITRO_VITE_IMPORT = `from 'nitro/vite'`;
const ANGULAR_PLUGIN_PKG = '@analogjs/vite-plugin-angular';
const NITRO_PKG = 'nitro';
const NITRO_VERSION = '3.0.260415-beta';
const MIGRATION_DOC_URL =
  'https://analogjs.org/docs/guides/migrating-v2-to-v3#analog-angular-and-nitro-are-now-separate-plugins';

const VITE_CONFIG_EXTENSIONS = ['.ts', '.mts', '.js', '.mjs'];

function isViteConfig(filePath: string): boolean {
  const file = filePath.slice(filePath.lastIndexOf('/') + 1);
  if (!file.startsWith('vite.config.')) {
    return false;
  }
  return VITE_CONFIG_EXTENSIONS.some((ext) => file.endsWith(ext));
}

function usesLegacyPluginShape(source: string): boolean {
  if (!source.includes(ANALOG_PLATFORM_IMPORT)) {
    return false;
  }
  if (
    source.includes(ANGULAR_PLUGIN_IMPORT) &&
    source.includes(NITRO_VITE_IMPORT)
  ) {
    return false;
  }
  return /\banalog\s*\(/.test(source);
}

function readPackageJson(
  tree: Tree,
): { raw: string; pkg: Record<string, unknown> } | null {
  const content = tree.read('/package.json');
  if (!content) return null;
  const raw = content.toString('utf-8');
  try {
    return { raw, pkg: JSON.parse(raw) };
  } catch {
    return null;
  }
}

function getDepVersion(
  pkg: Record<string, unknown>,
  name: string,
): string | undefined {
  const dev =
    (pkg['devDependencies'] as Record<string, string> | undefined) ?? {};
  const reg = (pkg['dependencies'] as Record<string, string> | undefined) ?? {};
  return dev[name] ?? reg[name];
}

function addDependencies(tree: Tree, context: SchematicContext): boolean {
  const info = readPackageJson(tree);
  if (!info) return false;

  const { pkg, raw } = info;
  const devDeps = {
    ...((pkg['devDependencies'] as Record<string, string> | undefined) ?? {}),
  };
  let changed = false;

  if (!getDepVersion(pkg, ANGULAR_PLUGIN_PKG)) {
    // Match the @analogjs/platform pin so the angular plugin stays aligned
    // with the rest of the Analog packages already in this workspace.
    const platformVersion = getDepVersion(pkg, '@analogjs/platform') ?? '*';
    devDeps[ANGULAR_PLUGIN_PKG] = platformVersion;
    changed = true;
    context.logger.info(
      `Added '${ANGULAR_PLUGIN_PKG}': '${platformVersion}' to devDependencies.`,
    );
  }

  if (!getDepVersion(pkg, NITRO_PKG)) {
    devDeps[NITRO_PKG] = NITRO_VERSION;
    changed = true;
    context.logger.info(
      `Added '${NITRO_PKG}': '${NITRO_VERSION}' to devDependencies.`,
    );
  }

  if (!changed) return false;

  pkg['devDependencies'] = devDeps;
  const trailingNewline = raw.endsWith('\n') ? '\n' : '';
  tree.overwrite(
    '/package.json',
    JSON.stringify(pkg, null, 2) + trailingNewline,
  );
  context.addTask(new NodePackageInstallTask());
  return true;
}

export default function migrateToSeparatedPlugins(): Rule {
  return (tree: Tree, context: SchematicContext) => {
    const filesUsingLegacyShape: string[] = [];

    tree.visit((filePath) => {
      if (filePath.includes('/node_modules/')) return;
      if (!isViteConfig(filePath)) return;

      const content = tree.read(filePath);
      if (!content) return;

      const source = content.toString('utf-8');
      if (usesLegacyPluginShape(source)) {
        filesUsingLegacyShape.push(filePath);
      }
    });

    if (filesUsingLegacyShape.length === 0) {
      return tree;
    }

    context.logger.info(
      `Detected ${filesUsingLegacyShape.length} vite.config file(s) using the legacy single-call \`analog()\` plugin shape:`,
    );
    for (const file of filesUsingLegacyShape) {
      context.logger.info(`  - ${file}`);
    }
    context.logger.info(
      `Split \`analog()\` into \`analog() + angular() + nitro()\` and move each option to its owning plugin.\nSee ${MIGRATION_DOC_URL}`,
    );

    addDependencies(tree, context);

    return tree;
  };
}
