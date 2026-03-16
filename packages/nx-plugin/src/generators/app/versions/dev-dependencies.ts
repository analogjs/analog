import { lt } from 'semver';
import { stripIndents } from '@nx/devkit';
import {
  V17_X_NX_VITE,
  V17_X_ANALOG_JS_PLATFORM,
  V17_X_ANALOG_JS_VITE_PLUGIN_ANGULAR,
  V17_X_JSDOM,
  V17_X_VITE,
  V17_X_VITE_TSCONFIG_PATHS,
  V17_X_VITEST,
  V17_X_ANGULAR_DEVKIT_BUILD_ANGULAR,
} from './nx_17_X/versions';
import {
  V18_X_NX_VITE,
  V18_X_ANALOG_JS_PLATFORM,
  V18_X_ANALOG_JS_VITE_PLUGIN_ANGULAR,
  V18_X_JSDOM,
  V18_X_VITE,
  V18_X_VITE_TSCONFIG_PATHS,
  V18_X_VITEST,
  V18_X_ANGULAR_DEVKIT_BUILD_ANGULAR,
  V18_X_ANALOG_JS_VITEST_ANGULAR,
} from './nx_18_X/versions';

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
  nxVersion: string,
): Record<AnalogDevDependency, string> => {
  const escapedNxVersion = nxVersion.replace(/[~^]/, '');

  const nxViteDependency = getViteDependency(escapedNxVersion);
  const devDependencies = getDevDependencies(escapedNxVersion);

  return { ...nxViteDependency, ...devDependencies };
};

const getViteDependency = (escapedNxVersion: string) => {
  // fail out for versions <17.0.0
  if (lt(escapedNxVersion, '17.0.0')) {
    throw new Error(
      stripIndents`Nx v17.0.0 or newer is required to install Analog`,
    );
  }

  // install 17.0 deps for versions =< 18.0.0
  if (lt(escapedNxVersion, '18.0.0')) {
    return {
      '@nx/vite': V17_X_NX_VITE,
    };
  }

  // return latest deps for versions >= 18.0.0
  return {
    '@nx/vite': V18_X_NX_VITE,
  };
};

const getDevDependencies = (escapedNxVersion: string) => {
  // fail out for versions <17.0.0
  if (lt(escapedNxVersion, '17.0.0')) {
    throw new Error(
      stripIndents`Nx v17.0.0 or newer is required to install Analog`,
    );
  }

  // install 17.x deps for versions <18.0.0
  if (lt(escapedNxVersion, '18.0.0')) {
    return {
      '@analogjs/platform': V17_X_ANALOG_JS_PLATFORM,
      '@analogjs/vite-plugin-angular': V17_X_ANALOG_JS_VITE_PLUGIN_ANGULAR,
      '@angular-devkit/build-angular': V17_X_ANGULAR_DEVKIT_BUILD_ANGULAR,
      jsdom: V17_X_JSDOM,
      vite: V17_X_VITE,
      'vite-tsconfig-paths': V17_X_VITE_TSCONFIG_PATHS,
      vitest: V17_X_VITEST,
    };
  }

  // return latest 18.x deps for versions >18.0.0
  return {
    '@analogjs/platform': V18_X_ANALOG_JS_PLATFORM,
    '@analogjs/vite-plugin-angular': V18_X_ANALOG_JS_VITE_PLUGIN_ANGULAR,
    '@analogjs/vitest-angular': V18_X_ANALOG_JS_VITEST_ANGULAR,
    '@angular-devkit/build-angular': V18_X_ANGULAR_DEVKIT_BUILD_ANGULAR,
    jsdom: V18_X_JSDOM,
    vite: V18_X_VITE,
    'vite-tsconfig-paths': V18_X_VITE_TSCONFIG_PATHS,
    vitest: V18_X_VITEST,
  };
};
