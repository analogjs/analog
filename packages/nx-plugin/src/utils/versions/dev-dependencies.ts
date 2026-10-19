import { lt } from 'semver';
import { stripIndents } from '@nx/devkit';
import {
  ANALOG_JS_PLATFORM,
  ANALOG_JS_VITE_PLUGIN_ANGULAR,
  ANALOG_JS_VITEST_ANGULAR,
  JSDOM,
  VITE_TSCONFIG_PATHS,
  VITE,
  VITEST,
  NX,
} from './versions';

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
    '@analogjs/platform': ANALOG_JS_PLATFORM,
    '@analogjs/vite-plugin-angular': ANALOG_JS_VITE_PLUGIN_ANGULAR,
    '@analogjs/vitest-angular': ANALOG_JS_VITEST_ANGULAR,
    '@nx/vite': NX,
    jsdom: JSDOM,
    'vite-tsconfig-paths': VITE_TSCONFIG_PATHS,
    vite: VITE,
    vitest: VITEST,
    '@vitest/coverage-v8': VITEST,
    '@vitest/ui': VITEST,
  };
};
