import { lt } from 'semver';
import {
  V16_X_ANALOG_JS_CONTENT,
  V16_X_ANALOG_JS_ROUTER,
  V16_X_NX_ANGULAR,
} from './ng_16_X/versions';
import { stripIndents } from '@nx/devkit';
import {
  V17_X_ANALOG_JS_CONTENT,
  V17_X_ANALOG_JS_ROUTER,
  V17_X_NX_ANGULAR,
} from './ng_17_X/versions';
import {
  V15_X_ANALOG_JS_CONTENT,
  V15_X_ANALOG_JS_ROUTER,
  V15_X_NX_ANGULAR,
} from './ng_15_X/versions';
import {
  V18_X_ANALOG_JS_CONTENT,
  V18_X_ANALOG_JS_ROUTER,
  V18_X_NX_ANGULAR,
} from './ng_18_X/versions';

const dependencyKeys = [
  '@analogjs/content',
  '@analogjs/router',
  '@nx/angular',
] as const;
export type AnalogDependency = (typeof dependencyKeys)[number];

export const getAnalogDependencies = (
  ngVersion: string
): Record<AnalogDependency, string> => {
  const escapedNgVersion = ngVersion.replace(/[~^]/, '');

  const dependencies = getDependencies(escapedNgVersion);

  return { ...dependencies };
};

const getDependencies = (escapedAngularVersion: string) => {
  // fail out for versions <15.2.0
  if (lt(escapedAngularVersion, '15.0.0')) {
    throw new Error(stripIndents`Angular v15.0.0 or newer is required.`);
  }

  // install 15.x deps for versions <16.0.0
  if (lt(escapedAngularVersion, '16.0.0')) {
    return {
      '@analogjs/content': V15_X_ANALOG_JS_CONTENT,
      '@analogjs/router': V15_X_ANALOG_JS_ROUTER,
      '@nx/angular': V15_X_NX_ANGULAR,
    };
  }

  // install 16.x deps for versions <17.0.0
  if (lt(escapedAngularVersion, '17.0.0')) {
    return {
      '@analogjs/content': V16_X_ANALOG_JS_CONTENT,
      '@analogjs/router': V16_X_ANALOG_JS_ROUTER,
      '@nx/angular': V16_X_NX_ANGULAR,
    };
  }

  // install 17.x deps for versions <18.0.0
  if (lt(escapedAngularVersion, '18.0.0')) {
    return {
      '@analogjs/content': V17_X_ANALOG_JS_CONTENT,
      '@analogjs/router': V17_X_ANALOG_JS_ROUTER,
      '@nx/angular': V17_X_NX_ANGULAR,
    };
  }

  // return latest 18.x deps for versions >18.0.0
  return {
    '@analogjs/content': V18_X_ANALOG_JS_CONTENT,
    '@analogjs/router': V18_X_ANALOG_JS_ROUTER,
    '@nx/angular': V18_X_NX_ANGULAR,
  };
};
