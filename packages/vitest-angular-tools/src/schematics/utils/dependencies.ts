import { Tree, SchematicsException } from '@angular-devkit/schematics';
import { lt } from 'semver';
import {
  ANALOG_JS_VITE_PLUGIN_ANGULAR,
  JSDOM,
  PLAYWRIGHT,
  VITE,
  VITE_TSCONFIG_PATHS,
  VITEST_BROWSER_PLAYWRIGHT,
  VITEST_V4,
} from './versions';

export interface DependencyOptions {
  browserMode?: boolean;
}

export function getDevDependencies(
  angularVersion: string,
  options: DependencyOptions = {},
): Record<string, string> {
  const escapedVersion = angularVersion.replace(/[~^]/, '');

  if (lt(escapedVersion, '17.0.0')) {
    throw new SchematicsException('Angular v17.0.0 or newer is required.');
  }

  const deps: Record<string, string> = {
    '@analogjs/vite-plugin-angular': ANALOG_JS_VITE_PLUGIN_ANGULAR,
    vite: VITE,
    vitest: VITEST_V4,
    'vite-tsconfig-paths': VITE_TSCONFIG_PATHS,
  };

  if (options.browserMode) {
    deps['@vitest/browser-playwright'] = VITEST_BROWSER_PLAYWRIGHT;
    deps['playwright'] = PLAYWRIGHT;
  } else {
    deps['jsdom'] = JSDOM;
  }

  return deps;
}

export function addDevDependencies(
  tree: Tree,
  angularVersion: string,
  options: DependencyOptions = {},
): void {
  const packageJsonPath = 'package.json';
  const packageJson = tree.read(packageJsonPath);
  if (!packageJson) {
    throw new SchematicsException('Could not find package.json');
  }

  const pkg = JSON.parse(packageJson.toString('utf-8'));
  const devDeps = getDevDependencies(angularVersion, options);

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
