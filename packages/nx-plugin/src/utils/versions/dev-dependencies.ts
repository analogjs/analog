import { lt } from 'semver';
import { stripIndents } from '@nx/devkit';
import {
  V19_X_ANALOG_JS_PLATFORM,
  V19_X_ANALOG_JS_VITE_PLUGIN_ANGULAR,
  V19_X_ANALOG_JS_VITEST_ANGULAR,
  V19_X_NX_VITE,
  V19_X_JSDOM,
  V19_X_VITE_TSCONFIG_PATHS,
  V19_X_VITEST,
  V19_X_VITE,
  NX_X_LATEST_VITE,
  NX_X_LATEST_VITEST,
  NX_X_LATEST_NX,
} from './ng_19_X/versions';

const devDependencyKeys = [
  '@analogjs/platform',
  '@analogjs/vite-plugin-angular',
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
  nxVersion?: string,
): Record<AnalogDevDependency, string> => {
  const escapedNgVersion = ngVersion.replace(/[~^]/, '');
  const escapedNxVersion = nxVersion ? nxVersion.replace(/[~^]/, '') : null;

  const devDependencies = getDevDependencies(
    escapedNgVersion,
    escapedNxVersion,
  );

  return { ...devDependencies };
};

const getDevDependencies = (
  escapedAngularVersion: string,
  escapedNxVersion: string | null,
) => {
  // fail out for versions <20.0.0
  if (lt(escapedAngularVersion, '20.0.0')) {
    throw new Error(stripIndents`Angular v20.0.0 or newer is required.`);
  }

  // return latest deps for versions >=20.0.0
  return {
    '@analogjs/platform': V19_X_ANALOG_JS_PLATFORM,
    '@analogjs/vite-plugin-angular': V19_X_ANALOG_JS_VITE_PLUGIN_ANGULAR,
    '@analogjs/vitest-angular': V19_X_ANALOG_JS_VITEST_ANGULAR,
    '@nx/vite':
      escapedNxVersion && !lt(escapedNxVersion, '23.0.0')
        ? NX_X_LATEST_NX
        : V19_X_NX_VITE,
    jsdom: V19_X_JSDOM,
    'vite-tsconfig-paths': V19_X_VITE_TSCONFIG_PATHS,
    vite:
      escapedNxVersion && lt(escapedNxVersion, '20.5.0')
        ? V19_X_VITE
        : NX_X_LATEST_VITE,
    vitest:
      lt(escapedAngularVersion, '21.0.0') ||
      (escapedNxVersion && lt(escapedNxVersion, '22.3.0'))
        ? V19_X_VITEST
        : NX_X_LATEST_VITEST,
    '@vitest/coverage-v8':
      lt(escapedAngularVersion, '21.0.0') ||
      (escapedNxVersion && lt(escapedNxVersion, '22.3.0'))
        ? V19_X_VITEST
        : NX_X_LATEST_VITEST,
    '@vitest/ui':
      lt(escapedAngularVersion, '21.0.0') ||
      (escapedNxVersion && lt(escapedNxVersion, '22.3.0'))
        ? V19_X_VITEST
        : NX_X_LATEST_VITEST,
  };
};
