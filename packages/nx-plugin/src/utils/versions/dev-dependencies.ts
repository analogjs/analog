import { lt } from 'semver';
import { stripIndents } from '@nx/devkit';
import {
  V19_X_ANALOG_JS_PLATFORM,
  V19_X_ANALOG_JS_VITE_PLUGIN_ANGULAR,
  V19_X_ANALOG_JS_VITEST_ANGULAR,
  V19_X_JSDOM,
  V19_X_VITE_TSCONFIG_PATHS,
  NX_X_LATEST_VITE,
  NX_X_LATEST_VITEST,
  NX_X_LATEST_NX,
} from './ng_19_X/versions';

const devDependencyKeys = [
  '@analogjs/platform',
  '@analogjs/vite-plugin-angular',
  '@analogjs/vitest-angular',
  '@nx/vite',
  'jsdom',
  'vite-tsconfig-paths',
  'vitest',
  'vite',
  '@vitest/coverage-v8',
  '@vitest/ui',
] as const;
export type AnalogDevDependency = (typeof devDependencyKeys)[number];

export const getAnalogDevDependencies = (
  ngVersion: string,
): Record<AnalogDevDependency, string> => {
  const escapedNgVersion = ngVersion.replace(/[~^]/, '');

  // fail out for versions <20.0.0
  if (lt(escapedNgVersion, '20.0.0')) {
    throw new Error(stripIndents`Angular v20.0.0 or newer is required.`);
  }

  return {
    '@analogjs/platform': V19_X_ANALOG_JS_PLATFORM,
    '@analogjs/vite-plugin-angular': V19_X_ANALOG_JS_VITE_PLUGIN_ANGULAR,
    '@analogjs/vitest-angular': V19_X_ANALOG_JS_VITEST_ANGULAR,
    '@nx/vite': NX_X_LATEST_NX,
    jsdom: V19_X_JSDOM,
    'vite-tsconfig-paths': V19_X_VITE_TSCONFIG_PATHS,
    vite: NX_X_LATEST_VITE,
    vitest: NX_X_LATEST_VITEST,
    '@vitest/coverage-v8': NX_X_LATEST_VITEST,
    '@vitest/ui': NX_X_LATEST_VITEST,
  };
};
