import { lt } from 'semver';
import {
  V16_X_ANALOG_JS_PLATFORM,
  V16_X_ANALOG_JS_VITE_PLUGIN_ANGULAR,
  V16_X_JSDOM,
  V16_X_NX_VITE,
  V16_X_VITE,
  V16_X_VITE_TSCONFIG_PATHS,
  V16_X_VITEST,
} from './nx_16_X/versions';
import {
  V15_X_ANALOG_JS_PLATFORM,
  V15_X_ANALOG_JS_VITE_PLUGIN_ANGULAR,
  V15_X_JSDOM,
  V15_X_NRWL_VITE,
  V15_X_NX_VITE,
  V15_X_VITE,
  V15_X_VITE_TSCONFIG_PATHS,
  V15_X_VITEST,
} from './nx_15_X/versions';
import { stripIndents } from '@nx/devkit';

// TODO: @analogjs/vite-plugin-angular is being defined as we must pin
// a supported version for Angular 15.x. This is not necessary for 16.x,
// so this could probably be amended to only add as an explicit
// devDependency for 15.x.
const devDependencyKeys = [
  '@analogjs/platform',
  '@analogjs/vite-plugin-angular',
  'jsdom',
  'vite',
  'vite-tsconfig-paths',
  'vitest',
] as const;
export type AnalogDevDependency = (typeof devDependencyKeys)[number];

export const getAnalogDevDependencies = (
  nxVersion: string
): Record<AnalogDevDependency, string> => {
  const escapedNxVersion = nxVersion.replace(/[~^]/, '');

  const nxViteDependency = getViteDependency(escapedNxVersion);
  const devDependencies = getDevDependencies(escapedNxVersion);

  return { ...nxViteDependency, ...devDependencies };
};

const getViteDependency = (escapedNxVersion: string) => {
  // fail out for versions <15.2.0
  if (lt(escapedNxVersion, '15.2.0')) {
    throw new Error(
      stripIndents`Nx v15.2.0 or newer is required to install Analog`
    );
  }
  // install 15.8 deps for versions 15.8.0 =< 16.0.0
  if (lt(escapedNxVersion, '16.0.0')) {
    return {
      '@nrwl/vite': V15_X_NRWL_VITE,
    };
  }

  // install 16.0 deps for versions 16.0.0 =< 16.1.0
  if (lt(escapedNxVersion, '16.1.0')) {
    return {
      '@nx/vite': V15_X_NX_VITE,
    };
  }

  // return latest deps for versions >= 16.4.0
  return {
    '@nx/vite': V16_X_NX_VITE,
  };
};

const getDevDependencies = (escapedNxVersion: string) => {
  // fail out for versions <15.2.0
  if (lt(escapedNxVersion, '15.2.0')) {
    throw new Error(
      stripIndents`Nx v15.2.0 or newer is required to install Analog`
    );
  }

  // install 15.x deps for versions <16.1.0
  if (lt(escapedNxVersion, '16.1.0')) {
    return {
      '@analogjs/platform': V15_X_ANALOG_JS_PLATFORM,
      '@analogjs/vite-plugin-angular': V15_X_ANALOG_JS_VITE_PLUGIN_ANGULAR,
      jsdom: V15_X_JSDOM,
      vite: V15_X_VITE,
      'vite-tsconfig-paths': V15_X_VITE_TSCONFIG_PATHS,
      vitest: V15_X_VITEST,
    };
  }

  // return latest 16.x deps for versions >16.1.0
  return {
    '@analogjs/platform': V16_X_ANALOG_JS_PLATFORM,
    '@analogjs/vite-plugin-angular': V16_X_ANALOG_JS_VITE_PLUGIN_ANGULAR,
    jsdom: V16_X_JSDOM,
    vite: V16_X_VITE,
    'vite-tsconfig-paths': V16_X_VITE_TSCONFIG_PATHS,
    vitest: V16_X_VITEST,
  };
};
