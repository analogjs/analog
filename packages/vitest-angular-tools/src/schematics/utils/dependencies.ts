import { Tree, SchematicsException } from '@angular-devkit/schematics';
import { lt } from 'semver';
import {
  ANALOG_JS_VITE_PLUGIN_ANGULAR,
  JSDOM,
  VITE,
  VITE_TSCONFIG_PATHS,
  VITEST_V3,
  VITEST_V4,
} from './versions';

export function getDevDependencies(
  angularVersion: string,
): Record<string, string> {
  const escapedVersion = angularVersion.replace(/[~^]/, '');

  if (lt(escapedVersion, '17.0.0')) {
    throw new SchematicsException('Angular v17.0.0 or newer is required.');
  }

  const vitestVersion = lt(escapedVersion, '21.0.0') ? VITEST_V3 : VITEST_V4;

  return {
    '@analogjs/vite-plugin-angular': ANALOG_JS_VITE_PLUGIN_ANGULAR,
    jsdom: JSDOM,
    vite: VITE,
    vitest: vitestVersion,
    'vite-tsconfig-paths': VITE_TSCONFIG_PATHS,
  };
}

export function addDevDependencies(tree: Tree, angularVersion: string): void {
  const packageJsonPath = 'package.json';
  const packageJson = tree.read(packageJsonPath);
  if (!packageJson) {
    throw new SchematicsException('Could not find package.json');
  }

  const pkg = JSON.parse(packageJson.toString('utf-8'));
  const devDeps = getDevDependencies(angularVersion);

  pkg.devDependencies = pkg.devDependencies || {};
  Object.entries(devDeps).forEach(([name, version]) => {
    pkg.devDependencies[name] = version;
  });

  // Sort devDependencies alphabetically
  pkg.devDependencies = Object.keys(pkg.devDependencies)
    .sort()
    .reduce((acc: Record<string, string>, key) => {
      acc[key] = pkg.devDependencies[key];
      return acc;
    }, {});

  tree.overwrite(packageJsonPath, JSON.stringify(pkg, null, 2) + '\n');
}
