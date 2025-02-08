import { lt } from 'semver';
import {
  V16_X_ANALOG_JS_PLATFORM,
  V16_X_ANALOG_JS_VITE_PLUGIN_ANGULAR,
  V16_X_ANALOG_JS_VITEST_ANGULAR,
  V16_X_JSDOM,
  V16_X_NX_VITE,
  V16_X_VITE_TSCONFIG_PATHS,
  V16_X_VITEST,
} from './ng_16_X/versions';
import { stripIndents } from '@nx/devkit';
import {
  V17_X_ANALOG_JS_PLATFORM,
  V17_X_ANALOG_JS_VITE_PLUGIN_ANGULAR,
  V17_X_ANALOG_JS_VITEST_ANGULAR,
  V17_X_JSDOM,
  V17_X_NX_VITE,
  V17_X_VITE_TSCONFIG_PATHS,
  V17_X_VITEST,
} from './ng_17_X/versions';
import {
  V15_X_ANALOG_JS_PLATFORM,
  V15_X_ANALOG_JS_VITE_PLUGIN_ANGULAR,
  V15_X_NX_VITE,
  V15_X_JSDOM,
  V15_X_VITE_TSCONFIG_PATHS,
  V15_X_VITEST,
  V15_X_ANALOG_JS_VITEST_ANGULAR,
} from './ng_15_X/versions';
import {
  V18_X_ANALOG_JS_PLATFORM,
  V18_X_ANALOG_JS_VITE_PLUGIN_ANGULAR,
  V18_X_NX_VITE,
  V18_X_JSDOM,
  V18_X_VITE_TSCONFIG_PATHS,
  V18_X_VITEST,
  V18_X_ANALOG_JS_VITEST_ANGULAR,
} from './ng_18_X/versions';
import {
  V19_X_ANALOG_JS_PLATFORM,
  V19_X_ANALOG_JS_VITE_PLUGIN_ANGULAR,
  V19_X_ANALOG_JS_VITEST_ANGULAR,
  V19_X_NX_VITE,
  V19_X_JSDOM,
  V19_X_VITE_TSCONFIG_PATHS,
  V19_X_VITEST,
  V19_X_VITE,
} from './ng_19_X/versions';

const devDependencyKeys = [
  '@analogjs/platform',
  '@analogjs/vite-plugin-angular',
  'jsdom',
  'vite-tsconfig-paths',
  'vitest',
  '@nx/vite',
  'vite',
] as const;
export type AnalogDevDependency = (typeof devDependencyKeys)[number];

export const getAnalogDevDependencies = (
  ngVersion: string,
): Record<AnalogDevDependency, string> => {
  const escapedNgVersion = ngVersion.replace(/[~^]/, '');

  const devDependencies = getDevDependencies(escapedNgVersion);

  return { ...devDependencies };
};

const getDevDependencies = (escapedAngularVersion: string) => {
  // fail out for versions <15.2.0
  if (lt(escapedAngularVersion, '15.0.0')) {
    throw new Error(stripIndents`Angular v15.0.0 or newer is required.`);
  }

  // install 15.x deps for versions <15.0.0
  if (lt(escapedAngularVersion, '16.0.0')) {
    return {
      '@analogjs/platform': V15_X_ANALOG_JS_PLATFORM,
      '@analogjs/vite-plugin-angular': V15_X_ANALOG_JS_VITE_PLUGIN_ANGULAR,
      '@analogjs/vitest-angular': V15_X_ANALOG_JS_VITEST_ANGULAR,
      '@nx/vite': V15_X_NX_VITE,
      jsdom: V15_X_JSDOM,
      'vite-tsconfig-paths': V15_X_VITE_TSCONFIG_PATHS,
      vite: V19_X_VITE,
      vitest: V15_X_VITEST,
    };
  }

  // install 16.x deps for versions <17.0.0
  if (lt(escapedAngularVersion, '17.0.0')) {
    return {
      '@analogjs/platform': V16_X_ANALOG_JS_PLATFORM,
      '@analogjs/vite-plugin-angular': V16_X_ANALOG_JS_VITE_PLUGIN_ANGULAR,
      '@analogjs/vitest-angular': V16_X_ANALOG_JS_VITEST_ANGULAR,
      '@nx/vite': V16_X_NX_VITE,
      jsdom: V16_X_JSDOM,
      'vite-tsconfig-paths': V16_X_VITE_TSCONFIG_PATHS,
      vite: V19_X_VITE,
      vitest: V16_X_VITEST,
    };
  }

  // install 17.x deps for versions <18.0.0
  if (lt(escapedAngularVersion, '18.0.0')) {
    return {
      '@analogjs/platform': V17_X_ANALOG_JS_PLATFORM,
      '@analogjs/vite-plugin-angular': V17_X_ANALOG_JS_VITE_PLUGIN_ANGULAR,
      '@analogjs/vitest-angular': V17_X_ANALOG_JS_VITEST_ANGULAR,
      '@nx/vite': V17_X_NX_VITE,
      jsdom: V17_X_JSDOM,
      'vite-tsconfig-paths': V17_X_VITE_TSCONFIG_PATHS,
      vite: V19_X_VITE,
      vitest: V17_X_VITEST,
    };
  }

  // install 18.x deps for versions <19.0.0
  if (lt(escapedAngularVersion, '18.0.0')) {
    return {
      '@analogjs/platform': V18_X_ANALOG_JS_PLATFORM,
      '@analogjs/vite-plugin-angular': V18_X_ANALOG_JS_VITE_PLUGIN_ANGULAR,
      '@analogjs/vitest-angular': V18_X_ANALOG_JS_VITEST_ANGULAR,
      '@nx/vite': V18_X_NX_VITE,
      jsdom: V18_X_JSDOM,
      'vite-tsconfig-paths': V18_X_VITE_TSCONFIG_PATHS,
      vite: V19_X_VITE,
      vitest: V18_X_VITEST,
    };
  }

  // return latest 19.x deps for versions >19.0.0
  return {
    '@analogjs/platform': V19_X_ANALOG_JS_PLATFORM,
    '@analogjs/vite-plugin-angular': V19_X_ANALOG_JS_VITE_PLUGIN_ANGULAR,
    '@analogjs/vitest-angular': V19_X_ANALOG_JS_VITEST_ANGULAR,
    '@nx/vite': V19_X_NX_VITE,
    jsdom: V19_X_JSDOM,
    'vite-tsconfig-paths': V19_X_VITE_TSCONFIG_PATHS,
    vite: V19_X_VITE,
    vitest: V19_X_VITEST,
  };
};
