import { lt } from 'semver';
import {
  V16_X_ANALOG_JS_PLATFORM,
  V16_X_JSDOM,
  V16_X_NX_VITE,
  V16_X_VITE_TSCONFIG_PATHS,
  V16_X_VITEST,
} from './ng_16_X/versions';
import { stripIndents } from '@nx/devkit';
import {
  V17_X_ANALOG_JS_PLATFORM,
  V17_X_JSDOM,
  V17_X_NX_VITE,
  V17_X_VITE_TSCONFIG_PATHS,
  V17_X_VITEST,
} from './ng_17_X/versions';

const devDependencyKeys = [
  '@analogjs/platform',
  'jsdom',
  'vite-tsconfig-paths',
  'vitest',
  '@nx/vite',
] as const;
export type AnalogDevDependency = (typeof devDependencyKeys)[number];

export const getAnalogDevDependencies = (
  nxVersion: string
): Record<AnalogDevDependency, string> => {
  const escapedNxVersion = nxVersion.replace(/[~^]/, '');

  const devDependencies = getDevDependencies(escapedNxVersion);

  return { ...devDependencies };
};

const getDevDependencies = (escapedAngularVersion: string) => {
  // fail out for versions <15.2.0
  if (lt(escapedAngularVersion, '16.0.0')) {
    throw new Error(stripIndents`Angular v16.0.0 or newer is required.`);
  }

  // install 16.x deps for versions <17.0.0
  if (lt(escapedAngularVersion, '17.0.0')) {
    return {
      '@analogjs/platform': V16_X_ANALOG_JS_PLATFORM,
      '@nx/vite': V16_X_NX_VITE,
      jsdom: V16_X_JSDOM,
      'vite-tsconfig-paths': V16_X_VITE_TSCONFIG_PATHS,
      vitest: V16_X_VITEST,
    };
  }

  // return latest 17.x deps for versions >17.0.0
  return {
    '@analogjs/platform': V17_X_ANALOG_JS_PLATFORM,
    '@nx/vite': V17_X_NX_VITE,
    jsdom: V17_X_JSDOM,
    'vite-tsconfig-paths': V17_X_VITE_TSCONFIG_PATHS,
    vitest: V17_X_VITEST,
  };
};
